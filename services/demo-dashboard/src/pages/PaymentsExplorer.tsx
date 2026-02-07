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
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageInspector } from "../components/MessageInspector";
import { DevDebugPanel } from "../components/DevDebugPanel";
import { getPaymentStatus, getPaymentMessages } from "../services/api";

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
            { id: 14, name: "Construct pacs.008", apiCall: "Message Build", isoMessage: "pacs.008" },
            { id: 15, name: "Submit to IPS", apiCall: "POST /iso20022/pacs008", isoMessage: "pacs.008" },
            { id: 16, name: "Settlement Chain", apiCall: "Nexus → Dest IPS → SAP", isoMessage: "-" },
        ],
    },
    {
        phase: 5,
        name: "Completion",
        steps: [
            { id: 17, name: "Accept & Notify", apiCall: "Response Processing", isoMessage: "pacs.002" },
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

export function PaymentsExplorer() {
    const [searchParams] = useSearchParams();
    const [uetrInput, setUetrInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [payment, setPayment] = useState<PaymentDetails | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
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
                                Messages
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
