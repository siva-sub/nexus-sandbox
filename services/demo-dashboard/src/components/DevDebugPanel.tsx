import {
    Card,
    Stack,
    Group,
    Text,
    Badge,
    Table,
    Code,
    Alert,
    Title,
    Collapse,
    Switch,
    CopyButton,
    Tooltip,
    ActionIcon,
} from "@mantine/core";
import { IconCode, IconTransform, IconInfoCircle, IconMessageCircle, IconCopy, IconCheck, IconTerminal2 } from "@tabler/icons-react";
import { useState } from "react";

export interface ActorContext {
    actorType: "PSP" | "FXP" | "IPS" | "SAP" | "PDO" | "GATEWAY";
    actorBic?: string;
    actorName?: string;
}

interface DevDebugPanelProps {
    context?: ActorContext;
    showToggle?: boolean;
    defaultOpen?: boolean;
}

// ISO 20022 Messages by Actor Type
const ISO_MESSAGES_BY_ACTOR: Record<string, { send: string[]; receive: string[] }> = {
    PSP: {
        send: ["pacs.008 (FI Credit Transfer)", "acmt.023 (Proxy Resolution Request)"],
        receive: ["pacs.002 (Payment Status Report)", "acmt.024 (Proxy Resolution Response)"],
    },
    FXP: {
        send: ["pacs.009 (FI-to-FI Credit)", "camt.056 (Rate Quote)"],
        receive: ["pacs.008 (FI Credit Transfer)", "pacs.002 (Settlement Status)"],
    },
    IPS: {
        send: ["pacs.002 (Settlement Status)"],
        receive: ["pacs.008 (Local Settlement Instruction)", "pacs.009 (Cross-border Leg)"],
    },
    SAP: {
        send: ["pacs.009 (Liquidity Bridge)"],
        receive: ["pacs.008 (Cross-border Instruction)", "pacs.002 (Status from D-IPS)"],
    },
    PDO: {
        send: ["acmt.024 (Identification Verification Report)"],
        receive: ["acmt.023 (Identification Verification Request)"],
    },
    GATEWAY: {
        send: ["All messages (orchestration)", "pacs.008 (transformed)", "pacs.002 (aggregated)"],
        receive: ["All messages from all actors"],
    },
};

// Key fields each actor handles
const KEY_FIELDS_BY_ACTOR: Record<string, { field: string; tag: string; purpose: string }[]> = {
    PSP: [
        { field: "UETR", tag: "<GrpHdr><PmtInfId>", purpose: "End-to-end transaction tracking" },
        { field: "InstrId", tag: "<CdtTrfTxInf><PmtId><InstrId>", purpose: "PSP's instruction ID" },
        { field: "DbtrAcct", tag: "<DbtrAcct><Id>", purpose: "Debtor account reference" },
        { field: "ChrgBr", tag: "<ChrgBr>", purpose: "Who pays fees (DEBT/CRED/SHAR)" },
    ],
    FXP: [
        { field: "XchgRate", tag: "<XchgRateInf><XchgRate>", purpose: "Applied FX rate" },
        { field: "QuoteId", tag: "<PmtId><TxId>", purpose: "Links to rate lock" },
        { field: "IntrBkSttlmAmt", tag: "<IntrBkSttlmAmt>", purpose: "Settlement amount in dest CCY" },
        { field: "SttlmMtd", tag: "<SttlmInf><SttlmMtd>", purpose: "Settlement method (CLRG)" },
    ],
    IPS: [
        { field: "ClrSysRef", tag: "<ClrSysRef>", purpose: "Local clearing system reference" },
        { field: "SttlmDt", tag: "<IntrBkSttlmDt>", purpose: "Settlement date" },
        { field: "AccptncDtTm", tag: "<AccptncDtTm>", purpose: "SLA timeout calculation" },
        { field: "TxSts", tag: "<TxInfAndSts><TxSts>", purpose: "ACCC/RJCT status" },
    ],
    SAP: [
        { field: "IntrmyAgt1", tag: "<IntrmyAgt1>", purpose: "Source SAP routing" },
        { field: "IntrmyAgt2", tag: "<IntrmyAgt2>", purpose: "Destination SAP routing" },
        { field: "InstgAgt", tag: "<InstgAgt>", purpose: "Instructing agent (swapped)" },
        { field: "InstdAgt", tag: "<InstdAgt>", purpose: "Instructed agent (swapped)" },
    ],
    PDO: [
        { field: "Id", tag: "<Vrfctn><Id>", purpose: "Proxy identifier (phone/email)" },
        { field: "Tp", tag: "<Vrfctn><Tp>", purpose: "Proxy type (MOBL/EMAL/etc)" },
        { field: "Nm", tag: "<Updtd><Nm>", purpose: "Resolved beneficiary name" },
        { field: "BICFI", tag: "<Agt><FinInstnId><BICFI>", purpose: "Destination bank BIC" },
    ],
    GATEWAY: [
        { field: "All Agent Fields", tag: "IntrmyAgt1/2", purpose: "Route determination" },
        { field: "Amount Fields", tag: "IntrBkSttlmAmt", purpose: "FX conversion" },
        { field: "Clearing System", tag: "ClrSysMmbId", purpose: "IPS routing" },
        { field: "Status Aggregation", tag: "TxSts", purpose: "Final confirmation" },
    ],
};

// API Test Commands by Actor
const API_TEST_COMMANDS: Record<string, { endpoint: string; method: string; description: string; curl: string }[]> = {
    PSP: [
        {
            endpoint: "/v1/psps",
            method: "GET",
            description: "List all PSPs",
            curl: 'curl -s http://localhost:8000/v1/psps | jq .',
        },
        {
            endpoint: "/v1/quotes",
            method: "POST",
            description: "Request FX quotes",
            curl: 'curl -s -X POST http://localhost:8000/v1/quotes -H "Content-Type: application/json" -d \'{"sourceCountry":"SG","destinationCountry":"IN","sourceAmount":"1000","sourceCurrency":"SGD"}\' | jq .',
        },
    ],
    FXP: [
        {
            endpoint: "/v1/rates",
            method: "GET",
            description: "View submitted rates",
            curl: 'curl -s http://localhost:8000/v1/rates | jq .',
        },
        {
            endpoint: "/v1/rates",
            method: "POST",
            description: "Submit new rate",
            curl: 'curl -s -X POST http://localhost:8000/v1/rates -H "Content-Type: application/json" -d \'{"fxpId":"FXP001","sourceCurrency":"SGD","destinationCurrency":"INR","rate":"62.50"}\' | jq .',
        },
    ],
    IPS: [
        {
            endpoint: "/v1/ips",
            method: "GET",
            description: "List IPS operators",
            curl: 'curl -s http://localhost:8000/v1/ips | jq .',
        },
        {
            endpoint: "/health",
            method: "GET",
            description: "Check health status",
            curl: 'curl -s http://localhost:8000/health | jq .',
        },
    ],
    SAP: [
        {
            endpoint: "/v1/quotes/{quoteId}/intermediary-agents",
            method: "GET",
            description: "Get SAP routing for quote",
            curl: 'curl -s "http://localhost:8000/v1/quotes/550e8400-e29b-41d4-a716-446655440000/intermediary-agents" | jq .',
        },
        {
            endpoint: "/v1/liquidity/balances",
            method: "GET",
            description: "Check FXP liquidity",
            curl: 'curl -s http://localhost:8000/v1/liquidity/balances | jq .',
        },
    ],
    PDO: [
        {
            endpoint: "/v1/proxy/resolve",
            method: "POST",
            description: "Resolve phone/email to account",
            curl: 'curl -s -X POST http://localhost:8000/v1/proxy/resolve -H "Content-Type: application/json" -d \'{"proxyType":"MOBL","proxyValue":"+919876543210","destinationCountry":"IN"}\' | jq .',
        },
    ],
    GATEWAY: [
        {
            endpoint: "/v1/countries",
            method: "GET",
            description: "List supported corridors",
            curl: 'curl -s http://localhost:8000/v1/countries | jq .',
        },
        {
            endpoint: "/v1/payments",
            method: "GET",
            description: "Query payment history",
            curl: 'curl -s http://localhost:8000/v1/payments?limit=10 | jq .',
        },
    ],
};

// Nexus Gateway Transformations
const GATEWAY_TRANSFORMATIONS = [
    { name: "Agent Swapping", input: "InstgAgt: S-PSP, InstdAgt: S-SAP", output: "InstgAgt: D-SAP, InstdAgt: D-PSP" },
    { name: "Amount Conversion", input: "IntrBkSttlmAmt: 1000 SGD", output: "IntrBkSttlmAmt: 62,218 INR" },
    { name: "Clearing System", input: "ClrSysMmbId: FAST", output: "ClrSysMmbId: UPI" },
    { name: "Message Type (leg)", input: "pacs.008 (Source Leg)", output: "pacs.008 (Dest Leg)" },
];

export function DevDebugPanel({ context, showToggle = true, defaultOpen = false }: DevDebugPanelProps) {
    const [devMode, setDevMode] = useState(defaultOpen);
    const actorType = context?.actorType || "GATEWAY";
    const isoMessages = ISO_MESSAGES_BY_ACTOR[actorType] || ISO_MESSAGES_BY_ACTOR.GATEWAY;
    const keyFields = KEY_FIELDS_BY_ACTOR[actorType] || KEY_FIELDS_BY_ACTOR.GATEWAY;
    const apiCommands = API_TEST_COMMANDS[actorType] || API_TEST_COMMANDS.GATEWAY;

    const header = showToggle ? (
        <Group justify="space-between" mb={devMode ? "md" : 0}>
            <Switch
                label="Developer Mode"
                size="sm"
                checked={devMode}
                onChange={(e) => setDevMode(e.currentTarget.checked)}
                color="violet"
            />
            {devMode && <Badge color="violet" variant="light">ISO 20022 Message Traces</Badge>}
        </Group>
    ) : null;

    if (showToggle && !devMode) {
        return header;
    }

    return (
        <Stack gap="md">
            {header}
            <Collapse in={devMode || !showToggle}>
                <Card withBorder radius="md" p="lg" bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))">
                    <Group justify="space-between" mb="md">
                        <Group gap="xs">
                            <IconCode size={24} color="var(--mantine-color-violet-filled)" />
                            <Title order={4}>Developer Debug Panel</Title>
                        </Group>
                        <Badge color="violet" variant="light">{actorType} Actor View</Badge>
                    </Group>

                    <Stack gap="md">
                        {/* API Test Commands - NEW ACTIONABLE SECTION */}
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Group gap="xs" mb="sm">
                                <IconTerminal2 size={18} color="var(--mantine-color-cyan-filled)" />
                                <Text size="sm" fw={700}>API Test Commands ({actorType})</Text>
                            </Group>
                            <Alert color="cyan" variant="light" mb="md">
                                <Text size="xs">
                                    Copy and run these commands in your terminal to test {actorType} API endpoints:
                                </Text>
                            </Alert>
                            <Stack gap="xs">
                                {apiCommands.map((cmd, i) => (
                                    <Card key={i} withBorder radius="xs" p="xs" bg="light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))">
                                        <Group justify="space-between" mb={4}>
                                            <Group gap="xs">
                                                <Badge color={cmd.method === "GET" ? "blue" : "green"} size="xs">{cmd.method}</Badge>
                                                <Code>{cmd.endpoint}</Code>
                                            </Group>
                                            <CopyButton value={cmd.curl}>
                                                {({ copied, copy }) => (
                                                    <Tooltip label={copied ? "Copied!" : "Copy curl"}>
                                                        <ActionIcon color={copied ? "teal" : "gray"} onClick={copy} size="sm">
                                                            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </CopyButton>
                                        </Group>
                                        <Text size="xs" c="dimmed" mb={4}>{cmd.description}</Text>
                                        <Code block style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                                            {cmd.curl}
                                        </Code>
                                    </Card>
                                ))}
                            </Stack>
                        </Card>

                        {/* ISO Messages for this Actor */}
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Group gap="xs" mb="sm">
                                <IconMessageCircle size={18} color="var(--mantine-color-blue-filled)" />
                                <Text size="sm" fw={700}>ISO 20022 Messages ({actorType})</Text>
                            </Group>
                            <Table withColumnBorders verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Direction</Table.Th>
                                        <Table.Th>Messages</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td><Badge color="green" size="sm">SEND</Badge></Table.Td>
                                        <Table.Td>
                                            {isoMessages.send.map((msg, i) => (
                                                <Code key={i} block={false} style={{ marginRight: 4, marginBottom: 4 }}>{msg}</Code>
                                            ))}
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="blue" size="sm">RECEIVE</Badge></Table.Td>
                                        <Table.Td>
                                            {isoMessages.receive.map((msg, i) => (
                                                <Code key={i} block={false} style={{ marginRight: 4, marginBottom: 4 }}>{msg}</Code>
                                            ))}
                                        </Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>

                        {/* Key Fields for this Actor */}
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Group gap="xs" mb="sm">
                                <IconTransform size={18} color="var(--mantine-color-green-filled)" />
                                <Text size="sm" fw={700}>Key ISO Fields ({actorType})</Text>
                            </Group>
                            <Table withColumnBorders verticalSpacing="xs" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Field</Table.Th>
                                        <Table.Th>XPath/Tag</Table.Th>
                                        <Table.Th>Purpose</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {keyFields.map((f, i) => (
                                        <Table.Tr key={i}>
                                            <Table.Td><Code>{f.field}</Code></Table.Td>
                                            <Table.Td><Code>{f.tag}</Code></Table.Td>
                                            <Table.Td><Text size="xs" c="dimmed">{f.purpose}</Text></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Card>

                        {/* Gateway Transformations (show for all actors to understand flow) */}
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Group gap="xs" mb="sm">
                                <IconTransform size={18} color="var(--mantine-color-orange-filled)" />
                                <Text size="sm" fw={700}>Nexus Gateway Transformations</Text>
                            </Group>
                            <Alert color="violet" variant="light" mb="md">
                                <Text size="xs">
                                    The Nexus Gateway performs these transformations as pacs.008 passes from Source → Destination:
                                </Text>
                            </Alert>
                            <Table withColumnBorders verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Transformation</Table.Th>
                                        <Table.Th>Source Leg</Table.Th>
                                        <Table.Th>Destination Leg</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {GATEWAY_TRANSFORMATIONS.map((t, i) => (
                                        <Table.Tr key={i}>
                                            <Table.Td><Badge color={["blue", "green", "orange", "grape"][i % 4]} variant="light" size="sm">{t.name}</Badge></Table.Td>
                                            <Table.Td><Code>{t.input}</Code></Table.Td>
                                            <Table.Td><Code>{t.output}</Code></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Card>

                        {/* Actor Response Codes */}
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Group gap="xs" mb="sm">
                                <IconInfoCircle size={18} color="var(--mantine-color-red-filled)" />
                                <Text size="sm" fw={700}>pacs.002 Response Codes</Text>
                            </Group>
                            <Table withColumnBorders verticalSpacing="xs" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Code</Table.Th>
                                        <Table.Th>Status</Table.Th>
                                        <Table.Th>Description</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td><Badge color="green">ACCC</Badge></Table.Td>
                                        <Table.Td>Accepted</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Settlement Completed, Credited</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="yellow">ACTC</Badge></Table.Td>
                                        <Table.Td>Technical Acc</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Message validated, awaiting business</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">AB03</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Settlement Timeout (SLA breach)</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">AM04</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Insufficient Funds</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">BE23</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Proxy Not Found</Text></Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>
                    </Stack>
                </Card>
            </Collapse>
        </Stack>
    );
}

