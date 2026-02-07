/**
 * PaymentsExplorer - Transaction Lifecycle & Message Viewer
 * 
 * A comprehensive developer tool for exploring payment transactions,
 * viewing the 17-step lifecycle, and inspecting raw ISO 20022 messages.
 * 
 * Features:
 * - UETR-based transaction lookup
 * - 17-step lifecycle visualization
 * - Real-time status tracking
 * - ISO 20022 message inspection
 * - Debug information panel
 * 
 * Reference: ADR-011 Developer Observability
 * Author: Siva Subramanian (https://linkedin.com/in/sivasub987)
 */

import {
    Container,
    Paper,
    Title,
    Text,
    TextInput,
    Button,
    Group,
    Stack,
    Card,
    Badge,
    Timeline,
    Table,
    Code,
    Alert,
    Loader,
    SimpleGrid,
    Tabs,
    ActionIcon,
    CopyButton,
    Tooltip,
    Accordion,
    Collapse,
    ScrollArea,
} from "@mantine/core";
import {
    IconSearch,
    IconCheck,
    IconCopy,
    IconClock,
    IconAlertCircle,
    IconFileCode,
    IconTimeline,
    IconReceiptDollar,
    IconBuilding,
    IconCircleDot,
    IconCircle,
    IconCircleX,
    IconClipboardList,
    IconChevronDown,
    IconChevronUp,
    IconCode,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageInspector, XmlHighlighter } from "../components/MessageInspector";
import { DevDebugPanel } from "../components/DevDebugPanel";
import { getPaymentStatus, getPaymentMessages, getPaymentEvents } from "../services/api";

// 17-step lifecycle phases (matching LifecycleAccordion from Payment page)
const EXPLORER_LIFECYCLE_PHASES = [
    {
        phase: 1,
        name: "Payment Setup",
        steps: [
            { id: 1, name: "Select Country", apiCall: "GET /countries", isoMessage: "-" },
            { id: 2, name: "Define Amount", apiCall: "Validation", isoMessage: "-" },
        ],
    },
    {
        phase: 2,
        name: "Quoting",
        steps: [
            { id: 3, name: "Request Quotes", apiCall: "GET /quotes", isoMessage: "-" },
            { id: 4, name: "Rate Improvements", apiCall: "GET /rates", isoMessage: "-" },
            { id: 5, name: "Compare Offers", apiCall: "Calculation", isoMessage: "-" },
            { id: 6, name: "Lock Quote", apiCall: "Selection", isoMessage: "-" },
        ],
    },
    {
        phase: 3,
        name: "Addressing & Compliance",
        steps: [
            { id: 7, name: "Enter Address", apiCall: "GET /address-types", isoMessage: "-" },
            { id: 8, name: "Resolve Proxy", apiCall: "POST /addressing/resolve", isoMessage: "acmt.023/024" },
            { id: 9, name: "Sanctions Check", apiCall: "Internal Check", isoMessage: "-" },
            { id: 10, name: "Pre-Transaction Disclosure", apiCall: "GET /fees-and-amounts", isoMessage: "-" },
            { id: 11, name: "Sender Approval", apiCall: "User Confirmation", isoMessage: "-" },
        ],
    },
    {
        phase: 4,
        name: "Processing & Settlement",
        steps: [
            { id: 12, name: "Debtor Authorization", apiCall: "Bank Auth", isoMessage: "-" },
            { id: 13, name: "Get Intermediaries", apiCall: "GET /intermediary-agents", isoMessage: "-" },
            { id: 14, name: "Source SAP Reservation", apiCall: "camt.103 → Source SAP locks FXP source-currency nostro", isoMessage: "camt.103" },
            { id: 15, name: "Submit pacs.008 to IPS", apiCall: "POST /iso20022/pacs008", isoMessage: "pacs.008" },
            { id: 16, name: "Dest SAP Reservation", apiCall: "camt.103 → Dest SAP locks FXP dest-currency nostro", isoMessage: "camt.103" },
        ],
    },
    {
        phase: 5,
        name: "Completion & Reservation Outcome",
        steps: [
            { id: 17, name: "pacs.002 → Settle or Release", apiCall: "ACCC: reservations UTILIZED (debit finalized) · RJCT: reservations CANCELLED (funds released)", isoMessage: "pacs.002" },
        ],
    },
];

/**
 * Determine the step at which a payment reached or failed.
 * For ACSC/ACCC: all 17 steps completed.
 * For RJCT: completed up to step 15 (submitted), failed at step 15.
 * For other statuses: assume in-progress.
 */
function getCompletedStep(status: string): number {
    if (status === "ACSC" || status === "ACCC") return 17;
    if (status === "RJCT") return 15; // Failed at submission
    if (status === "ACSP" || status === "PDNG") return 14; // In progress
    return 0;
}

function getFailedStep(status: string): number | null {
    if (status === "RJCT") return 15;
    return null;
}

/**
 * Extract the rejection reason code from pacs.002 XML in the messages array.
 * Fallback for when the backend status API doesn't return statusReasonCode.
 */
function extractReasonFromMessages(msgs: Message[]): { code: string; description: string } | null {
    const pacs002 = msgs.find((m) => m.messageType === "pacs.002");
    if (!pacs002?.xml) return null;

    // Extract <TxSts> and <Rsn><Cd> from pacs.002 XML
    const codeMatch = pacs002.xml.match(/<(?:\w+:)?Cd>([A-Z0-9]+)<\/(?:\w+:)?Cd>/);
    const txSts = pacs002.xml.match(/<(?:\w+:)?TxSts>(\w+)<\/(?:\w+:)?TxSts>/);

    if (txSts?.[1] !== "RJCT") return null;

    const code = codeMatch?.[1] || "RJCT";
    // Map reason codes to descriptions
    const descriptions: Record<string, string> = {
        AB04: "Quote Expired / Exchange Rate Mismatch",
        TM01: "Timeout - Invalid Cut Off Time",
        DUPL: "Duplicate Payment Detected",
        AC01: "Incorrect Account Number",
        MS02: "Not Specified Reason - Customer Generated",
        RR04: "Regulatory Reason",
        AM04: "Insufficient Funds",
        BE23: "Missing Creditor Address",
        RC11: "Invalid Settlement Account Provider",
        AB03: "Timeout - Transaction Aborted",
    };

    return { code, description: descriptions[code] || `Rejected (${code})` };
}

// Status code descriptions
const STATUS_CODES: Record<string, { description: string; color: string }> = {
    ACSC: { description: "Settlement Completed", color: "green" },
    ACCC: { description: "Settlement Completed (Legacy)", color: "green" },
    ACSP: { description: "Settlement in Progress", color: "blue" },
    RJCT: { description: "Rejected", color: "red" },
    PDNG: { description: "Pending", color: "yellow" },
    AB03: { description: "Timeout - Aborted", color: "orange" },
    AB04: { description: "Quote Expired", color: "orange" },
    AM04: { description: "Insufficient Funds", color: "red" },
    TM01: { description: "Timeout - Invalid Cut Off", color: "orange" },
    DUPL: { description: "Duplicate Payment", color: "red" },
    BE23: { description: "Account Not Found", color: "red" },
    RC11: { description: "Invalid SAP", color: "red" },
    AC01: { description: "Incorrect Account Number", color: "red" },
    MS02: { description: "Not Specified Reason Customer", color: "red" },
    RR04: { description: "Regulatory Reason", color: "red" },
};

interface PaymentDetails {
    uetr: string;
    status: string;
    statusReasonCode?: string;
    reasonDescription?: string;
    sourcePsp: string;
    destinationPsp: string;
    amount: number;
    currency: string;
    initiatedAt: string;
    completedAt?: string;
}

interface Message {
    messageType: string;
    direction: "inbound" | "outbound";
    xml: string;
    timestamp: string;
    description?: string;
}

interface EventDetail {
    event_id: string;
    uetr: string;
    event_type: string;
    actor: string;
    data: {
        step?: number;
        leg?: string;
        message?: string;
        isoMessage?: string;
        trigger?: string;
        sapBic?: string;
        fxpId?: string;
        currency?: string;
        amount?: string;
        [key: string]: unknown;
    };
    occurred_at: string;
    // XML message columns from payment_events table
    pacs008_message?: string | null;
    pacs002_message?: string | null;
    camt103_message?: string | null;
    camt054_message?: string | null;
    acmt023_message?: string | null;
    acmt024_message?: string | null;
    pain001_message?: string | null;
    pacs004_message?: string | null;
    pacs028_message?: string | null;
    camt056_message?: string | null;
    camt029_message?: string | null;
}

/** Map XML column names to their ISO message type labels */
const XML_COLUMN_LABELS: Record<string, string> = {
    pacs008_message: "pacs.008",
    pacs002_message: "pacs.002",
    camt103_message: "camt.103",
    camt054_message: "camt.054",
    acmt023_message: "acmt.023",
    acmt024_message: "acmt.024",
    pain001_message: "pain.001",
    pacs004_message: "pacs.004",
    pacs028_message: "pacs.028",
    camt056_message: "camt.056",
    camt029_message: "camt.029",
};

/** Extract non-null XML messages from an event */
function getEventXmlMessages(evt: EventDetail): { label: string; xml: string }[] {
    const result: { label: string; xml: string }[] = [];
    for (const [col, label] of Object.entries(XML_COLUMN_LABELS)) {
        const xml = (evt as unknown as Record<string, unknown>)[col];
        if (xml && typeof xml === "string") {
            result.push({ label, xml });
        }
    }
    return result;
}

const ACTOR_COLORS: Record<string, string> = {
    "S-PSP": "blue", "S-IPS": "cyan", "S-SAP": "teal",
    "D-SAP": "orange", "D-IPS": "grape", "D-PSP": "pink",
    "NEXUS": "indigo", "FXP": "violet",
};

/** Single actor event item with optional expandable XML */
function ActorEventItem({ evt }: { evt: EventDetail }) {
    const [xmlExpanded, setXmlExpanded] = useState<string | null>(null);
    const knownActor = Object.keys(ACTOR_COLORS).find(k => evt.actor?.includes(k));
    const color = knownActor ? ACTOR_COLORS[knownActor] : (ACTOR_COLORS[evt.actor] || "gray");
    const isUtilized = evt.event_type === "RESERVATION_UTILIZED";
    const isCancelled = evt.event_type === "RESERVATION_CANCELLED";
    const xmlMessages = getEventXmlMessages(evt);

    return (
        <Timeline.Item
            key={evt.event_id}
            bullet={isUtilized ? <IconCheck size={12} /> : isCancelled ? <IconCircleX size={12} /> : <IconCircleDot size={12} />}
            color={isCancelled ? "red" : isUtilized ? "green" : color}
            title={
                <Group gap="xs" align="center">
                    <Badge size="xs" color={color} variant="filled">{evt.actor}</Badge>
                    <Text size="sm" fw={600}>{evt.event_type}</Text>
                    {evt.data?.isoMessage && (
                        <Badge size="xs" variant="outline">{evt.data.isoMessage}</Badge>
                    )}
                    {evt.data?.leg && (
                        <Badge size="xs" variant="light" color="gray">{evt.data.leg}</Badge>
                    )}
                </Group>
            }
        >
            {evt.data?.message && (
                <Text size="xs" c="dimmed" mt={2}>{evt.data.message}</Text>
            )}
            {evt.data?.trigger && (
                <Text size="xs" c="dimmed" fs="italic">Trigger: {evt.data.trigger}</Text>
            )}
            {evt.data?.currency && evt.data?.amount && (
                <Text size="xs" fw={500} mt={2}>
                    {evt.data.currency} {Number(evt.data.amount).toLocaleString()}
                    {evt.data.sapBic ? ` @ ${evt.data.sapBic}` : ""}
                </Text>
            )}
            <Text size="xs" c="dimmed" mt={4}>
                {evt.occurred_at ? new Date(evt.occurred_at).toLocaleString() : ""}
            </Text>

            {/* XML viewer buttons */}
            {xmlMessages.length > 0 && (
                <Group gap="xs" mt={6}>
                    {xmlMessages.map(({ label }) => (
                        <Button
                            key={label}
                            size="compact-xs"
                            variant={xmlExpanded === label ? "filled" : "light"}
                            color="violet"
                            leftSection={<IconCode size={12} />}
                            rightSection={xmlExpanded === label ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
                            onClick={() => setXmlExpanded(xmlExpanded === label ? null : label)}
                        >
                            {label}
                        </Button>
                    ))}
                </Group>
            )}

            {/* Expanded XML content */}
            {xmlMessages.map(({ label, xml }) => (
                <Collapse key={label} in={xmlExpanded === label}>
                    <Card shadow="xs" p="xs" mt="xs" radius="sm" withBorder style={{ backgroundColor: "#1E1E1E" }}>
                        <Group justify="space-between" mb={4}>
                            <Badge size="xs" color="violet">{label}</Badge>
                            <CopyButton value={xml}>
                                {({ copied, copy }) => (
                                    <Tooltip label={copied ? "Copied!" : "Copy XML"}>
                                        <ActionIcon size="xs" variant="subtle" onClick={copy} color={copied ? "teal" : "gray"}>
                                            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        </Group>
                        <ScrollArea h={250}>
                            <XmlHighlighter xml={xml} />
                        </ScrollArea>
                    </Card>
                </Collapse>
            ))}
        </Timeline.Item>
    );
}

function ActorEventTimeline({ events }: { events: EventDetail[] }) {
    return (
        <Timeline active={events.length - 1} bulletSize={24} lineWidth={2}>
            {events.map((evt, i) => (
                <ActorEventItem key={evt.event_id || i} evt={evt} />
            ))}
        </Timeline>
    );
}

export function PaymentsExplorer() {
    const [searchParams] = useSearchParams();
    const [uetrInput, setUetrInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [payment, setPayment] = useState<PaymentDetails | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [events, setEvents] = useState<EventDetail[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Handle URL query param for direct linking from demo
    useEffect(() => {
        const uetrFromUrl = searchParams.get("uetr");
        if (uetrFromUrl && uetrFromUrl !== uetrInput) {
            setUetrInput(uetrFromUrl);
            // Auto-search when UETR is provided via URL
            searchPaymentByUetr(uetrFromUrl);
        }
    }, [searchParams]);

    const searchPaymentByUetr = async (uetr: string) => {
        setLoading(true);
        setError(null);
        setPayment(null);
        setMessages([]);
        setEvents([]);

        try {
            // Fetch payment status using mock-enabled API
            const statusData = await getPaymentStatus(uetr);

            if (statusData.status === "NOT_FOUND") {
                setError(`Payment not found: ${uetr}`);
                setLoading(false);
                return;
            }

            setPayment(statusData as PaymentDetails);

            // Fetch messages using mock-enabled API
            const msgData = await getPaymentMessages(uetr);
            setMessages((msgData.messages || []) as Message[]);

            // Fetch events (actor trail) from backend DB
            try {
                const evtData = await getPaymentEvents(uetr);
                setEvents((evtData.events || []) as unknown as EventDetail[]);
            } catch {
                // Events are optional — don't fail the whole search
                setEvents([]);
            }
        } catch (err) {
            setError(`Failed to fetch payment: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const searchPayment = async () => {
        if (!uetrInput.trim()) {
            setError("Please enter a UETR");
            return;
        }
        await searchPaymentByUetr(uetrInput);
    };

    const getStatusInfo = (code: string) =>
        STATUS_CODES[code] || { description: "Unknown Status", color: "gray" };

    return (
        <Container size="xl" py="md">
            <Stack gap="lg">
                {/* Header */}
                <div>
                    <Title order={1}>Payments Explorer</Title>
                    <Text c="dimmed">
                        Developer tool for tracing the 17-step payment lifecycle and inspecting ISO 20022 messages
                    </Text>
                </div>

                {/* Search */}
                <Paper shadow="xs" p="md" radius="md" withBorder>
                    <Group>
                        <TextInput
                            placeholder="Enter UETR (e.g., f47ac10b-58cc-4372-a567-0e02b2c3d479)"
                            value={uetrInput}
                            onChange={(e) => setUetrInput(e.target.value)}
                            style={{ flex: 1 }}
                            leftSection={<IconSearch size={16} />}
                            onKeyDown={(e) => e.key === "Enter" && searchPayment()}
                        />
                        <Button
                            onClick={searchPayment}
                            loading={loading}
                            leftSection={<IconSearch size={16} />}
                        >
                            Search
                        </Button>
                    </Group>
                </Paper>

                {/* Error */}
                {error && (
                    <Alert
                        icon={<IconAlertCircle size={16} />}
                        title="Error"
                        color="red"
                        withCloseButton
                        onClose={() => setError(null)}
                    >
                        {error}
                    </Alert>
                )}

                {/* Loading */}
                {loading && (
                    <Group justify="center" py="xl">
                        <Loader size="lg" />
                        <Text>Searching for transaction...</Text>
                    </Group>
                )}

                {/* Results */}
                {payment && (
                    <Tabs defaultValue="overview" variant="pills">
                        <Tabs.List mb="md">
                            <Tabs.Tab value="overview" leftSection={<IconReceiptDollar size={16} />}>
                                Overview
                            </Tabs.Tab>
                            <Tabs.Tab value="lifecycle" leftSection={<IconTimeline size={16} />}>
                                Lifecycle
                            </Tabs.Tab>
                            <Tabs.Tab value="messages" leftSection={<IconFileCode size={16} />}>
                                Messages ({messages.filter((msg, idx, arr) => idx === arr.findIndex(m => m.messageType === msg.messageType && m.direction === msg.direction && m.xml === msg.xml)).length})
                            </Tabs.Tab>
                            <Tabs.Tab value="events" leftSection={<IconTimeline size={16} />}>
                                Actor Events ({events.length})
                            </Tabs.Tab>
                            <Tabs.Tab value="debug" leftSection={<IconBuilding size={16} />}>
                                Debug Panel
                            </Tabs.Tab>
                        </Tabs.List>

                        {/* Overview Tab */}
                        <Tabs.Panel value="overview">
                            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                <Card shadow="xs" padding="lg" radius="md" withBorder>
                                    <Title order={4} mb="md">Transaction Details</Title>
                                    <Table>
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Td fw={500}>UETR</Table.Td>
                                                <Table.Td>
                                                    <Group gap="xs">
                                                        <Code>{payment.uetr}</Code>
                                                        <CopyButton value={payment.uetr}>
                                                            {({ copied, copy }) => (
                                                                <Tooltip label={copied ? "Copied!" : "Copy"}>
                                                                    <ActionIcon
                                                                        size="sm"
                                                                        variant="subtle"
                                                                        onClick={copy}
                                                                    >
                                                                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                                    </ActionIcon>
                                                                </Tooltip>
                                                            )}
                                                        </CopyButton>
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={500}>Status</Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={getStatusInfo(payment.status).color}
                                                        size="lg"
                                                    >
                                                        {payment.status}
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                            {payment.statusReasonCode && (
                                                <Table.Tr>
                                                    <Table.Td fw={500}>Reason Code</Table.Td>
                                                    <Table.Td>
                                                        <Badge color="gray" variant="light">
                                                            {payment.statusReasonCode}
                                                        </Badge>
                                                        {payment.reasonDescription && (
                                                            <Text size="xs" c="dimmed" mt={4}>
                                                                {payment.reasonDescription}
                                                            </Text>
                                                        )}
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                            <Table.Tr>
                                                <Table.Td fw={500}>Amount</Table.Td>
                                                <Table.Td>
                                                    <Text fw={600}>
                                                        {payment.currency} {payment.amount?.toLocaleString()}
                                                    </Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                </Card>

                                <Card shadow="xs" padding="lg" radius="md" withBorder>
                                    <Title order={4} mb="md">Participants</Title>
                                    <Table>
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Td fw={500}>Source PSP</Table.Td>
                                                <Table.Td>
                                                    <Code>{payment.sourcePsp || "N/A"}</Code>
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={500}>Destination PSP</Table.Td>
                                                <Table.Td>
                                                    <Code>{payment.destinationPsp || "N/A"}</Code>
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={500}>Initiated</Table.Td>
                                                <Table.Td>
                                                    <Group gap="xs">
                                                        <IconClock size={14} />
                                                        <Text size="sm">
                                                            {payment.initiatedAt
                                                                ? new Date(payment.initiatedAt).toLocaleString()
                                                                : "N/A"}
                                                        </Text>
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                            {payment.completedAt && (
                                                <Table.Tr>
                                                    <Table.Td fw={500}>Completed</Table.Td>
                                                    <Table.Td>
                                                        <Group gap="xs">
                                                            <IconCheck size={14} color="green" />
                                                            <Text size="sm">
                                                                {new Date(payment.completedAt).toLocaleString()}
                                                            </Text>
                                                        </Group>
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                        </Table.Tbody>
                                    </Table>
                                </Card>
                            </SimpleGrid>
                        </Tabs.Panel>

                        {/* Lifecycle Tab */}
                        <Tabs.Panel value="lifecycle">
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Group gap="xs" mb="md">
                                    <IconClipboardList size={20} color="var(--mantine-color-nexusPurple-filled)" />
                                    <Title order={5}>Payment Lifecycle</Title>
                                </Group>
                                {(() => {
                                    const completedStep = getCompletedStep(payment.status);
                                    const failedStep = getFailedStep(payment.status);
                                    const msgReason = extractReasonFromMessages(messages);
                                    const rejectionCode = payment.statusReasonCode || msgReason?.code || "RJCT";
                                    const rejectionDesc = payment.reasonDescription || msgReason?.description || "Payment rejected";
                                    return (
                                        <Accordion defaultValue={["1", "2"]} multiple>
                                            {EXPLORER_LIFECYCLE_PHASES.map(({ phase, name, steps }) => {
                                                const completedCount = steps.filter((s) => s.id <= completedStep && s.id !== failedStep).length;
                                                const hasFailed = failedStep !== null && steps.some((s) => s.id === failedStep);
                                                const hasActive = steps.some((s) => s.id === completedStep && !hasFailed);
                                                return (
                                                    <Accordion.Item key={phase} value={String(phase)}>
                                                        <Accordion.Control>
                                                            <Group justify="space-between">
                                                                <Text size="sm" fw={500}>Phase {phase}: {name}</Text>
                                                                <Badge
                                                                    size="sm"
                                                                    color={hasFailed ? "red" : completedCount === steps.length ? "green" : hasActive ? "blue" : "gray"}
                                                                >
                                                                    {completedCount}/{steps.length}
                                                                </Badge>
                                                            </Group>
                                                        </Accordion.Control>
                                                        <Accordion.Panel>
                                                            <Timeline active={steps.findIndex((s) => s.id > completedStep) - 1} bulletSize={20} lineWidth={2}>
                                                                {steps.map((step) => {
                                                                    const isCompleted = step.id <= completedStep && step.id !== failedStep;
                                                                    const isFailed = step.id === failedStep;
                                                                    const bulletIcon = isFailed
                                                                        ? <IconCircleX size={12} />
                                                                        : isCompleted
                                                                            ? <IconCircleDot size={12} />
                                                                            : <IconCircle size={12} />;
                                                                    const bulletColor = isFailed ? "red" : isCompleted ? "blue" : "gray";
                                                                    return (
                                                                        <Timeline.Item
                                                                            key={step.id}
                                                                            bullet={bulletIcon}
                                                                            color={bulletColor}
                                                                            title={
                                                                                <Group justify="space-between" align="center" style={{ width: "100%" }}>
                                                                                    <Group gap="xs">
                                                                                        <Text size="sm" fw={700}>{step.id}. {step.name}</Text>
                                                                                        {step.isoMessage !== "-" && (
                                                                                            <Badge size="xs" variant="outline">{step.isoMessage}</Badge>
                                                                                        )}
                                                                                    </Group>
                                                                                    <Text size="xs" c="dimmed" fs="italic">{step.apiCall}</Text>
                                                                                </Group>
                                                                            }
                                                                        >
                                                                            {isFailed && (
                                                                                <Text size="xs" c="red" fw={700} mt={4}>
                                                                                    ✕ REJECTED: {rejectionCode} — {rejectionDesc}
                                                                                </Text>
                                                                            )}
                                                                            {step.id === 17 && isCompleted && (
                                                                                <Text size="xs" c="green" fw={700} mt={4}>ACSC: Settlement Confirmed</Text>
                                                                            )}
                                                                        </Timeline.Item>
                                                                    );
                                                                })}
                                                            </Timeline>
                                                        </Accordion.Panel>
                                                    </Accordion.Item>
                                                );
                                            })}
                                        </Accordion>
                                    );
                                })()}
                            </Card>
                        </Tabs.Panel>

                        {/* Messages Tab */}
                        <Tabs.Panel value="messages">
                            <MessageInspector
                                uetr={payment.uetr}
                                messages={messages}
                                loading={false}
                            />
                        </Tabs.Panel>

                        {/* Actor Events Tab — real events from backend DB */}
                        <Tabs.Panel value="events">
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Group gap="xs" mb="md">
                                    <IconTimeline size={20} color="var(--mantine-color-nexusPurple-filled)" />
                                    <Title order={5}>Nexus Actor Event Trail</Title>
                                    <Badge size="sm" variant="light">{events.length} events</Badge>
                                </Group>
                                {events.length === 0 ? (
                                    <Text c="dimmed" ta="center" py="xl">
                                        No events recorded. Submit a payment to see the full actor trail.
                                    </Text>
                                ) : (
                                    <ActorEventTimeline events={events} />
                                )}
                            </Card>
                        </Tabs.Panel>

                        {/* Debug Tab */}
                        <Tabs.Panel value="debug">
                            <DevDebugPanel
                                context={{
                                    actorType: "GATEWAY",
                                    actorName: "Nexus Gateway"
                                }}
                                showToggle={false}
                                defaultOpen={true}
                            />
                        </Tabs.Panel>
                    </Tabs>
                )}

                {/* Empty State */}
                {!payment && !loading && !error && (
                    <Paper shadow="xs" p="xl" radius="md" withBorder>
                        <Stack align="center" gap="md">
                            <IconSearch size={48} color="gray" />
                            <Title order={3}>Search for a Payment</Title>
                            <Text c="dimmed" ta="center" maw={400}>
                                Enter a UETR to view the complete payment lifecycle,
                                ISO 20022 messages, and debug information.
                            </Text>
                            <Code>Example: f47ac10b-58cc-4372-a567-0e02b2c3d479</Code>
                        </Stack>
                    </Paper>
                )}
            </Stack>
        </Container>
    );
}

export default PaymentsExplorer;
