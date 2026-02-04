/**
 * Service Desk Mock Portal
 *
 * Simulates the Nexus Service Desk for manual workflows:
 * - Disputes: Log and track dispute cases
 * - Recalls: Submit payment recall requests
 *
 * Reference: NotebookLM 2026-02-03 - "Disputes are logged manually in the portal"
 * Reference: NotebookLM 2026-02-03 - "Source PSP logs Payment Recall Request in Service Desk"
 *
 * NOTE: In Nexus Release 1, pacs.004 and camt.056 are NOT supported.
 * This portal simulates the manual workflow described in the specification.
 */

import { useState } from "react";
import {
    Container,
    Title,
    Text,
    Card,
    Group,
    Stack,
    Badge,
    Button,
    Table,
    Alert,
    TextInput,
    Textarea,
    Select,
    Tabs,
    Timeline,
    Modal,
    Code,
} from "@mantine/core";
import {
    IconAlertTriangle,
    IconCheck,
    IconX,
    IconSend,
    IconClockHour4,
    IconMessageDots,
    IconFileDescription,
    IconArrowBack,
    IconScale,
    IconBuildingBank,
} from "@tabler/icons-react";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";

// Types
interface DisputeCase {
    id: string;
    originalUetr: string;
    disputeType: string;
    description: string;
    amount: string;
    currency: string;
    submittedBy: string;
    assignedTo: string;
    status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "ESCALATED";
    createdAt: string;
    lastUpdated: string;
    resolution?: string;
}

interface RecallRequest {
    id: string;
    originalUetr: string;
    recallReason: string;
    description: string;
    amount: string;
    currency: string;
    requesterPsp: string;
    destinationPsp: string;
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "COMPLETED";
    createdAt: string;
    slaDeadline: string;
    response?: string;
}

// Mock data
const INITIAL_DISPUTES: DisputeCase[] = [
    {
        id: "DISP-001",
        originalUetr: "91398cbd-0838-453f-b2c7-536e829f2b8e",
        disputeType: "INCORRECT_AMOUNT",
        description: "Amount received was 100 THB less than expected",
        amount: "1000.00",
        currency: "SGD",
        submittedBy: "DBSGSGSG",
        assignedTo: "BKKBTHBK",
        status: "UNDER_REVIEW",
        createdAt: "2026-02-03T10:00:00Z",
        lastUpdated: "2026-02-03T12:30:00Z",
    },
];

const INITIAL_RECALLS: RecallRequest[] = [
    {
        id: "RCL-001",
        originalUetr: "abc12345-0000-1111-2222-333344445555",
        recallReason: "FRAD",
        description: "Suspected fraudulent transaction - customer did not authorize",
        amount: "5000.00",
        currency: "SGD",
        requesterPsp: "DBSGSGSG",
        destinationPsp: "BKKBTHBK",
        status: "PENDING",
        createdAt: "2026-02-03T09:00:00Z",
        slaDeadline: "2026-02-04T09:00:00Z",
    },
];

const DISPUTE_TYPES = [
    { value: "INCORRECT_AMOUNT", label: "Incorrect Amount" },
    { value: "DUPLICATE_CREDIT", label: "Duplicate Credit" },
    { value: "WRONG_BENEFICIARY", label: "Wrong Beneficiary" },
    { value: "MISSING_CREDIT", label: "Missing Credit" },
    { value: "FX_RATE_DISPUTE", label: "FX Rate Dispute" },
    { value: "OTHER", label: "Other" },
];

const RECALL_REASONS = [
    { value: "CUST", label: "Customer Request" },
    { value: "DUPL", label: "Duplicate Payment" },
    { value: "FRAD", label: "Fraud Suspected" },
    { value: "TECH", label: "Technical Error" },
    { value: "AGNT", label: "Agent Error" },
];

const STATUS_COLORS = {
    OPEN: "blue",
    UNDER_REVIEW: "orange",
    RESOLVED: "green",
    ESCALATED: "red",
    PENDING: "yellow",
    ACCEPTED: "teal",
    REJECTED: "red",
    COMPLETED: "green",
};

export function ServiceDesk() {
    const navigate = useNavigate();
    const [disputes, setDisputes] = useState<DisputeCase[]>(INITIAL_DISPUTES);
    const [recalls, setRecalls] = useState<RecallRequest[]>(INITIAL_RECALLS);
    const [newDisputeOpen, setNewDisputeOpen] = useState(false);
    const [newRecallOpen, setNewRecallOpen] = useState(false);

    // Dispute form
    const disputeForm = useForm({
        initialValues: {
            originalUetr: "",
            disputeType: "",
            description: "",
            amount: "",
            currency: "SGD",
            submittedBy: "DBSGSGSG",
            assignedTo: "",
        },
    });

    // Recall form
    const recallForm = useForm({
        initialValues: {
            originalUetr: "",
            recallReason: "",
            description: "",
            amount: "",
            currency: "SGD",
            requesterPsp: "DBSGSGSG",
            destinationPsp: "",
        },
    });

    const submitDispute = (values: typeof disputeForm.values) => {
        const newDispute: DisputeCase = {
            id: `DISP-${String(disputes.length + 1).padStart(3, "0")}`,
            originalUetr: values.originalUetr,
            disputeType: values.disputeType,
            description: values.description,
            amount: values.amount,
            currency: values.currency,
            submittedBy: values.submittedBy,
            assignedTo: values.assignedTo,
            status: "OPEN",
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
        };
        setDisputes([newDispute, ...disputes]);
        setNewDisputeOpen(false);
        disputeForm.reset();
        notifications.show({
            title: "Dispute Logged",
            message: `Case ${newDispute.id} created and assigned to ${values.assignedTo}`,
            color: "blue",
        });
    };

    const submitRecall = (values: typeof recallForm.values) => {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 24);

        const newRecall: RecallRequest = {
            id: `RCL-${String(recalls.length + 1).padStart(3, "0")}`,
            originalUetr: values.originalUetr,
            recallReason: values.recallReason,
            description: values.description,
            amount: values.amount,
            currency: values.currency,
            requesterPsp: values.requesterPsp,
            destinationPsp: values.destinationPsp,
            status: "PENDING",
            createdAt: new Date().toISOString(),
            slaDeadline: deadline.toISOString(),
        };
        setRecalls([newRecall, ...recalls]);
        setNewRecallOpen(false);
        recallForm.reset();
        notifications.show({
            title: "Recall Request Submitted",
            message: `Request ${newRecall.id} sent to ${values.destinationPsp}. SLA: 24 hours.`,
            color: "yellow",
        });
    };

    const respondToRecall = (recallId: string, accept: boolean) => {
        setRecalls(
            recalls.map((r) =>
                r.id === recallId
                    ? {
                        ...r,
                        status: accept ? "ACCEPTED" : "REJECTED",
                        response: accept
                            ? "Recall accepted. Return payment will be initiated via pacs.008."
                            : "Recall rejected. Beneficiary confirmed transaction.",
                    }
                    : r
            )
        );
        notifications.show({
            title: accept ? "Recall Accepted" : "Recall Rejected",
            message: accept
                ? "Return payment should be initiated via pacs.008 with NexusOrgnlUETR prefix."
                : "Source PSP has been notified of rejection.",
            color: accept ? "green" : "red",
        });
    };

    return (
        <Container size="xl" py="md">
            <Stack gap="lg">
                {/* Header */}
                <Group justify="space-between">
                    <div>
                        <Title order={2}>Nexus Service Desk</Title>
                        <Text c="dimmed" size="sm">
                            Manual dispute and recall workflow portal (Release 1)
                        </Text>
                    </div>
                    <Badge size="lg" variant="light" color="orange">
                        Mock Portal
                    </Badge>
                </Group>

                {/* Info Alert */}
                <Alert
                    icon={<IconAlertTriangle size={16} />}
                    title="Nexus Release 1 - Manual Workflows"
                    color="orange"
                >
                    <Text size="sm">
                        In Nexus Release 1, disputes and recalls are processed manually through this
                        Service Desk. Automated <Code>camt.056</Code> and <Code>pacs.004</Code>{" "}
                        messages are planned for Release 2.
                    </Text>
                </Alert>

                {/* Tabs */}
                <Tabs defaultValue="disputes">
                    <Tabs.List>
                        <Tabs.Tab value="disputes" leftSection={<IconScale size={16} />}>
                            Disputes ({disputes.length})
                        </Tabs.Tab>
                        <Tabs.Tab value="recalls" leftSection={<IconArrowBack size={16} />}>
                            Recall Requests ({recalls.length})
                        </Tabs.Tab>
                        <Tabs.Tab value="workflow" leftSection={<IconFileDescription size={16} />}>
                            Workflow Guide
                        </Tabs.Tab>
                    </Tabs.List>

                    {/* Disputes Tab */}
                    <Tabs.Panel value="disputes" pt="md">
                        <Stack gap="md">
                            <Group justify="space-between">
                                <Text fw={500}>Active Dispute Cases</Text>
                                <Button
                                    leftSection={<IconMessageDots size={16} />}
                                    onClick={() => setNewDisputeOpen(true)}
                                >
                                    Log New Dispute
                                </Button>
                            </Group>

                            <Card withBorder>
                                <Table striped highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Case ID</Table.Th>
                                            <Table.Th>UETR</Table.Th>
                                            <Table.Th>Type</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th>Assigned To</Table.Th>
                                            <Table.Th>Created</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {disputes.map((d) => (
                                            <Table.Tr key={d.id}>
                                                <Table.Td>
                                                    <Code>{d.id}</Code>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" ff="monospace" truncate>
                                                        {d.originalUetr.slice(0, 8)}...
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>{d.disputeType}</Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={STATUS_COLORS[d.status]}
                                                        size="sm"
                                                    >
                                                        {d.status}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>{d.assignedTo}</Table.Td>
                                                <Table.Td>
                                                    <Text size="xs">
                                                        {new Date(d.createdAt).toLocaleDateString()}
                                                    </Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Card>
                        </Stack>
                    </Tabs.Panel>

                    {/* Recalls Tab */}
                    <Tabs.Panel value="recalls" pt="md">
                        <Stack gap="md">
                            <Group justify="space-between">
                                <Text fw={500}>Payment Recall Requests</Text>
                                <Button
                                    leftSection={<IconArrowBack size={16} />}
                                    color="orange"
                                    onClick={() => setNewRecallOpen(true)}
                                >
                                    Submit Recall Request
                                </Button>
                            </Group>

                            <Card withBorder>
                                <Table striped highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Request ID</Table.Th>
                                            <Table.Th>UETR</Table.Th>
                                            <Table.Th>Reason</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th>SLA Deadline</Table.Th>
                                            <Table.Th>Actions</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {recalls.map((r) => (
                                            <Table.Tr key={r.id}>
                                                <Table.Td>
                                                    <Code>{r.id}</Code>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" ff="monospace" truncate>
                                                        {r.originalUetr.slice(0, 8)}...
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge variant="outline">{r.recallReason}</Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={STATUS_COLORS[r.status]}
                                                        size="sm"
                                                    >
                                                        {r.status}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap="xs">
                                                        <IconClockHour4 size={14} />
                                                        <Text size="xs">
                                                            {new Date(
                                                                r.slaDeadline
                                                            ).toLocaleString()}
                                                        </Text>
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td>
                                                    {r.status === "PENDING" && (
                                                        <Group gap="xs">
                                                            <Button
                                                                size="compact-xs"
                                                                color="green"
                                                                leftSection={<IconCheck size={12} />}
                                                                onClick={() =>
                                                                    respondToRecall(r.id, true)
                                                                }
                                                            >
                                                                Accept
                                                            </Button>
                                                            <Button
                                                                size="compact-xs"
                                                                color="red"
                                                                variant="outline"
                                                                leftSection={<IconX size={12} />}
                                                                onClick={() =>
                                                                    respondToRecall(r.id, false)
                                                                }
                                                            >
                                                                Reject
                                                            </Button>
                                                        </Group>
                                                    )}
                                                    {r.status === "ACCEPTED" && (
                                                        <Button
                                                            size="compact-xs"
                                                            variant="light"
                                                            leftSection={<IconSend size={12} />}
                                                            onClick={() => navigate("/payment")}
                                                        >
                                                            Initiate Return
                                                        </Button>
                                                    )}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Card>

                            {/* Return Payment Guidance */}
                            <Alert
                                icon={<IconBuildingBank size={16} />}
                                title="Return Payment Process"
                                color="teal"
                            >
                                <Text size="sm" mb="xs">
                                    When a recall is accepted, the Destination PSP must initiate a
                                    return payment using <Code>pacs.008</Code> with the following
                                    remittance info:
                                </Text>
                                <Code block>
                                    {`<AddtlRmtInf>NexusOrgnlUETR:[original-uetr]</AddtlRmtInf>`}
                                </Code>
                            </Alert>
                        </Stack>
                    </Tabs.Panel>

                    {/* Workflow Guide Tab */}
                    <Tabs.Panel value="workflow" pt="md">
                        <Stack gap="lg">
                            {/* Dispute Workflow */}
                            <Card withBorder>
                                <Title order={4} mb="md">
                                    Dispute Resolution Workflow
                                </Title>
                                <Timeline active={-1} bulletSize={24} lineWidth={2}>
                                    <Timeline.Item
                                        bullet={<IconMessageDots size={12} />}
                                        title="1. Bilateral Resolution"
                                    >
                                        <Text c="dimmed" size="sm">
                                            PSPs attempt to resolve dispute bilaterally via Service
                                            Desk messaging.
                                        </Text>
                                    </Timeline.Item>
                                    <Timeline.Item
                                        bullet={<IconScale size={12} />}
                                        title="2. Nexus Dispute Resolution Committee"
                                    >
                                        <Text c="dimmed" size="sm">
                                            If bilateral resolution fails, escalate to the Nexus
                                            Dispute Resolution Committee.
                                        </Text>
                                    </Timeline.Item>
                                    <Timeline.Item
                                        bullet={<IconFileDescription size={12} />}
                                        title="3. External Arbitration"
                                    >
                                        <Text c="dimmed" size="sm">
                                            Final escalation path: external arbitration per Scheme
                                            Rulebook.
                                        </Text>
                                    </Timeline.Item>
                                </Timeline>
                            </Card>

                            {/* Recall Workflow */}
                            <Card withBorder>
                                <Title order={4} mb="md">
                                    Payment Recall Workflow (Release 1)
                                </Title>
                                <Timeline active={-1} bulletSize={24} lineWidth={2}>
                                    <Timeline.Item
                                        bullet={<IconArrowBack size={12} />}
                                        title="1. Submit Recall Request"
                                    >
                                        <Text c="dimmed" size="sm">
                                            Source PSP logs a "Payment Recall Request" in the Nexus
                                            Service Desk.
                                        </Text>
                                    </Timeline.Item>
                                    <Timeline.Item
                                        bullet={<IconClockHour4 size={12} />}
                                        title="2. Destination PSP Review"
                                    >
                                        <Text c="dimmed" size="sm">
                                            Destination PSP reviews within SLA (typically 24 hours).
                                        </Text>
                                    </Timeline.Item>
                                    <Timeline.Item
                                        bullet={<IconCheck size={12} />}
                                        title="3. Accept or Reject"
                                    >
                                        <Text c="dimmed" size="sm">
                                            D-PSP accepts (triggers return) or rejects (provides
                                            reason code).
                                        </Text>
                                    </Timeline.Item>
                                    <Timeline.Item
                                        bullet={<IconSend size={12} />}
                                        title="4. Return Payment (if accepted)"
                                    >
                                        <Text c="dimmed" size="sm">
                                            D-PSP initiates new <Code>pacs.008</Code> with{" "}
                                            <Code>NexusOrgnlUETR:</Code> prefix.
                                        </Text>
                                    </Timeline.Item>
                                </Timeline>
                            </Card>

                            {/* FX Risk */}
                            <Card withBorder>
                                <Title order={4} mb="md">
                                    FX Risk Allocation for Returns
                                </Title>
                                <Table>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Scenario</Table.Th>
                                            <Table.Th>Who Takes FX Risk</Table.Th>
                                            <Table.Th>Amount to Return</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        <Table.Tr>
                                            <Table.Td>Source PSP fault (sender error)</Table.Td>
                                            <Table.Td>
                                                <Badge color="blue">Source PSP</Badge>
                                            </Table.Td>
                                            <Table.Td>Exact Destination Currency received</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Td>
                                                Destination PSP fault (late reject)
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge color="orange">Destination PSP</Badge>
                                            </Table.Td>
                                            <Table.Td>Exact Source Currency sent</Table.Td>
                                        </Table.Tr>
                                    </Table.Tbody>
                                </Table>
                            </Card>
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            {/* New Dispute Modal */}
            <Modal
                opened={newDisputeOpen}
                onClose={() => setNewDisputeOpen(false)}
                title="Log New Dispute"
                size="md"
            >
                <form onSubmit={disputeForm.onSubmit(submitDispute)}>
                    <Stack gap="md">
                        <TextInput
                            label="Original UETR"
                            placeholder="91398cbd-0838-453f-b2c7-536e829f2b8e"
                            required
                            {...disputeForm.getInputProps("originalUetr")}
                        />
                        <Select
                            label="Dispute Type"
                            data={DISPUTE_TYPES}
                            required
                            {...disputeForm.getInputProps("disputeType")}
                        />
                        <Textarea
                            label="Description"
                            placeholder="Describe the dispute..."
                            required
                            {...disputeForm.getInputProps("description")}
                        />
                        <Group grow>
                            <TextInput
                                label="Amount"
                                placeholder="1000.00"
                                required
                                {...disputeForm.getInputProps("amount")}
                            />
                            <Select
                                label="Currency"
                                data={["SGD", "THB", "MYR", "USD"]}
                                {...disputeForm.getInputProps("currency")}
                            />
                        </Group>
                        <Select
                            label="Assign To (Counterparty PSP)"
                            data={[
                                { value: "DBSGSGSG", label: "DBS Bank Singapore" },
                                { value: "BKKBTHBK", label: "Bangkok Bank" },
                                { value: "MAYBMYKL", label: "Maybank Malaysia" },
                            ]}
                            required
                            {...disputeForm.getInputProps("assignedTo")}
                        />
                        <Group justify="flex-end" mt="md">
                            <Button variant="outline" onClick={() => setNewDisputeOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Submit Dispute</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            {/* New Recall Modal */}
            <Modal
                opened={newRecallOpen}
                onClose={() => setNewRecallOpen(false)}
                title="Submit Recall Request"
                size="md"
            >
                <form onSubmit={recallForm.onSubmit(submitRecall)}>
                    <Stack gap="md">
                        <TextInput
                            label="Original UETR"
                            placeholder="91398cbd-0838-453f-b2c7-536e829f2b8e"
                            required
                            {...recallForm.getInputProps("originalUetr")}
                        />
                        <Select
                            label="Recall Reason"
                            data={RECALL_REASONS}
                            required
                            {...recallForm.getInputProps("recallReason")}
                        />
                        <Textarea
                            label="Description"
                            placeholder="Reason for recall request..."
                            required
                            {...recallForm.getInputProps("description")}
                        />
                        <Group grow>
                            <TextInput
                                label="Original Amount"
                                placeholder="1000.00"
                                required
                                {...recallForm.getInputProps("amount")}
                            />
                            <Select
                                label="Currency"
                                data={["SGD", "THB", "MYR", "USD"]}
                                {...recallForm.getInputProps("currency")}
                            />
                        </Group>
                        <Select
                            label="Destination PSP"
                            data={[
                                { value: "DBSGSGSG", label: "DBS Bank Singapore" },
                                { value: "BKKBTHBK", label: "Bangkok Bank" },
                                { value: "MAYBMYKL", label: "Maybank Malaysia" },
                            ]}
                            required
                            {...recallForm.getInputProps("destinationPsp")}
                        />
                        <Alert color="yellow" icon={<IconClockHour4 size={16} />}>
                            <Text size="xs">
                                Destination PSP has 24 hours SLA to respond to recall requests.
                            </Text>
                        </Alert>
                        <Group justify="flex-end" mt="md">
                            <Button variant="outline" onClick={() => setNewRecallOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" color="orange">
                                Submit Recall
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Container>
    );
}
