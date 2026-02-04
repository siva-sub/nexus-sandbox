/**
 * Payment Demo - Interactive Flow Selector
 *
 * Provides a unified interface for testing payment scenarios:
 * - Happy Flows: Successful end-to-end payment with ACCC status
 * - Unhappy Flows: Various rejection scenarios with ISO 20022 error codes
 *
 * Features:
 * - SegmentedControl for flow type selection
 * - Stepper to show payment lifecycle stages
 * - Live message viewer with XML highlighting
 * - Status tracking with Timeline
 *
 * Reference: Mantine UI patterns, Nexus specification
 */

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Text,
    Card,
    Group,
    Stack,
    Badge,
    Button,
    SegmentedControl,
    Stepper,
    Table,
    Alert,
    Code,
    Paper,
    ThemeIcon,
    SimpleGrid,
    Timeline,
    Accordion,
    ScrollArea,
    Drawer,
    CopyButton,
    ActionIcon,
    Tooltip,
    Divider,
    Loader,
} from "@mantine/core";
import {
    IconCheck,
    IconX,
    IconAlertTriangle,
    IconPlayerPlay,
    IconRefresh,
    IconEye,
    IconCopy,
    IconCurrencyDollar,
    IconUser,
    IconClock,
    IconLock,
    IconSend,
    IconArrowRight,
    IconFileCode,
    IconMessageDots,
} from "@tabler/icons-react";
import { CodeHighlight } from "@mantine/code-highlight";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useNavigate, useLocation } from "react-router-dom";

// Types
interface FlowScenario {
    id: string;
    name: string;
    code: string;
    description: string;
    trigger: string;
    where: string;
    color: string;
    icon: React.FC<{ size?: number }>;
}

interface MessageLog {
    id: string;
    timestamp: string;
    direction: "inbound" | "outbound";
    messageType: string;
    actor: string;
    summary: string;
    xml?: string;
    status?: string;
}

// Scenarios
const HAPPY_FLOW: FlowScenario = {
    id: "happy",
    name: "Happy Flow",
    code: "ACCC",
    description: "Successful payment with settlement confirmation",
    trigger: "Any valid proxy (e.g., +65123456789)",
    where: "Phone number",
    color: "green",
    icon: IconCheck,
};

const UNHAPPY_FLOWS: FlowScenario[] = [
    {
        id: "be23",
        name: "Invalid Proxy",
        code: "BE23",
        description: "Account/Proxy not registered in destination PDO",
        trigger: "+66999999999",
        where: "Phone number",
        color: "red",
        icon: IconUser,
    },
    {
        id: "am04",
        name: "Insufficient Funds",
        code: "AM04",
        description: "Debtor account has insufficient balance",
        trigger: "99999 or 199999",
        where: "Amount",
        color: "orange",
        icon: IconCurrencyDollar,
    },
    {
        id: "am02",
        name: "Amount Limit",
        code: "AM02",
        description: "Transaction exceeds IPS limit (50,000)",
        trigger: "50001 or higher",
        where: "Amount",
        color: "yellow",
        icon: IconCurrencyDollar,
    },
    {
        id: "ab04",
        name: "Quote Expired",
        code: "AB04",
        description: "FX quote validity window exceeded (10 min)",
        trigger: "Wait 10+ minutes after quote",
        where: "Time-based",
        color: "blue",
        icon: IconClock,
    },
    {
        id: "ac04",
        name: "Closed Account",
        code: "AC04",
        description: "Recipient account has been closed",
        trigger: "+60999999999",
        where: "Phone number",
        color: "red",
        icon: IconX,
    },
    {
        id: "rr04",
        name: "Regulatory Block",
        code: "RR04",
        description: "AML/CFT screening failed",
        trigger: "+62999999999",
        where: "Phone number",
        color: "purple",
        icon: IconLock,
    },
];

// Sample XML messages
const SAMPLE_PACS008 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG-2026020311450001</MsgId>
      <CreDtTm>2026-02-03T11:45:00Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>INSTR-001</InstrId>
        <EndToEndId>E2E-001</EndToEndId>
        <UETR>91398cbd-0838-453f-b2c7-536e829f2b8e</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <InstdAmt Ccy="THB">25840.00</InstdAmt>
      <XchgRate>25.84</XchgRate>
      <Dbtr>
        <Nm>John Tan</Nm>
      </Dbtr>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>DBSGSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <Cdtr>
        <Nm>Somchai Thai</Nm>
      </Cdtr>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>BKKBTHBK</BICFI>
        </FinInstnId>
      </CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

const SAMPLE_PACS002_ACCC = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>PACS002-2026020311450001</MsgId>
      <CreDtTm>2026-02-03T11:45:05Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlInstrId>INSTR-001</OrgnlInstrId>
      <OrgnlEndToEndId>E2E-001</OrgnlEndToEndId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <TxSts>ACCC</TxSts>
      <AccptncDtTm>2026-02-03T11:45:05Z</AccptncDtTm>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;

const getSamplePacs002Rjct = (code: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>PACS002-RJCT-2026020311450001</MsgId>
      <CreDtTm>2026-02-03T11:45:02Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlInstrId>INSTR-001</OrgnlInstrId>
      <OrgnlEndToEndId>E2E-001</OrgnlEndToEndId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <TxSts>RJCT</TxSts>
      <StsRsnInf>
        <Rsn>
          <Cd>${code}</Cd>
        </Rsn>
        <AddtlInf>Payment rejected: ${code}</AddtlInf>
      </StsRsnInf>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;

export function PaymentDemo() {
    const navigate = useNavigate();
    const location = useLocation();
    const [flowType, setFlowType] = useState<"happy" | "unhappy">(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get("demo") ? "unhappy" : "happy";
    });
    const [selectedScenario, setSelectedScenario] = useState<FlowScenario>(() => {
        const params = new URLSearchParams(window.location.search);
        const demoCode = params.get("demo");
        if (demoCode) {
            return UNHAPPY_FLOWS.find((f) => f.code === demoCode) || HAPPY_FLOW;
        }
        return HAPPY_FLOW;
    });
    const [activeStep, setActiveStep] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [messages, setMessages] = useState<MessageLog[]>([]);
    const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);
    const [selectedMessage, setSelectedMessage] = useState<MessageLog | null>(null);

    // Initial state is now handled in useState initializers to avoid cascading renders.
    // We only need an effect if we want to handle programmatic navigation changes within the same component.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const demoCode = params.get("demo");
        if (demoCode) {
            const scenario = UNHAPPY_FLOWS.find((f) => f.code === demoCode);
            if (scenario && scenario.code !== selectedScenario.code) {
                queueMicrotask(() => {
                    setFlowType("unhappy");
                    setSelectedScenario(scenario);
                });
            }
        }
    }, [location.search, selectedScenario.code]);

    const handleFlowTypeChange = (value: string) => {
        setFlowType(value as "happy" | "unhappy");
        if (value === "happy") {
            setSelectedScenario(HAPPY_FLOW);
        } else {
            setSelectedScenario(UNHAPPY_FLOWS[0]);
        }
        resetDemo();
    };

    const resetDemo = () => {
        setActiveStep(0);
        setIsRunning(false);
        setMessages([]);
    };

    const runDemo = async () => {
        setIsRunning(true);
        setActiveStep(0);
        setMessages([]);

        const steps = [
            { delay: 500, step: 0, message: createMessage("pacs.008", "outbound", "S-IPS", "Payment instruction sent") },
            { delay: 1000, step: 1, message: createMessage("Quote", "inbound", "FXP", "FX quote validated") },
            { delay: 1500, step: 2, message: createMessage("acmt.023", "outbound", "Nexus", "Proxy resolution") },
            { delay: 2000, step: 3, message: null },
            {
                delay: 2500,
                step: 4,
                message: createMessage(
                    "pacs.002",
                    "inbound",
                    "D-IPS",
                    flowType === "happy" ? "ACCC - Accepted" : `RJCT - ${selectedScenario.code}`,
                    flowType === "happy" ? SAMPLE_PACS002_ACCC : getSamplePacs002Rjct(selectedScenario.code),
                    flowType === "happy" ? "ACCC" : "RJCT"
                ),
            },
        ];

        for (const { delay, step, message } of steps) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            setActiveStep(step);
            if (message) {
                setMessages((prev) => [...prev, message]);
            }
            // For unhappy flows, stop at validation step
            if (flowType === "unhappy" && step === 3) {
                setActiveStep(4);
                await new Promise((resolve) => setTimeout(resolve, 500));
                setMessages((prev) => [
                    ...prev,
                    createMessage(
                        "pacs.002",
                        "inbound",
                        "Nexus",
                        `RJCT - ${selectedScenario.code}: ${selectedScenario.name}`,
                        getSamplePacs002Rjct(selectedScenario.code),
                        "RJCT"
                    ),
                ]);
                break;
            }
        }

        setIsRunning(false);
        notifications.show({
            title: flowType === "happy" ? "Payment Completed" : "Payment Rejected",
            message: flowType === "happy" ? "ACCC - Settlement confirmed" : `${selectedScenario.code} - ${selectedScenario.name}`,
            color: flowType === "happy" ? "green" : "red",
        });
    };

    const createMessage = (
        type: string,
        direction: "inbound" | "outbound",
        actor: string,
        summary: string,
        xml?: string,
        status?: string
    ): MessageLog => ({
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        direction,
        messageType: type,
        actor,
        summary,
        xml: xml || (type === "pacs.008" ? SAMPLE_PACS008 : undefined),
        status,
    });

    const viewMessage = (msg: MessageLog) => {
        setSelectedMessage(msg);
        openDrawer();
    };

    return (
        <Container size="xl" py="md">
            <Stack gap="lg">
                {/* Header with Flow Type Selector */}
                <Card withBorder padding="md">
                    <Group justify="space-between" align="center">
                        <div>
                            <Title order={2}>Payment Demo</Title>
                            <Text c="dimmed" size="sm">
                                Interactive demonstration of Nexus payment flows
                            </Text>
                        </div>
                        <SegmentedControl
                            value={flowType}
                            onChange={handleFlowTypeChange}
                            data={[
                                {
                                    value: "happy",
                                    label: (
                                        <Group gap="xs">
                                            <IconCheck size={16} color="var(--mantine-color-green-6)" />
                                            <span>Happy Flow</span>
                                        </Group>
                                    ),
                                },
                                {
                                    value: "unhappy",
                                    label: (
                                        <Group gap="xs">
                                            <IconX size={16} color="var(--mantine-color-red-6)" />
                                            <span>Unhappy Flows</span>
                                        </Group>
                                    ),
                                },
                            ]}
                            size="md"
                        />
                    </Group>
                </Card>

                {/* Scenario Selector (Unhappy only) */}
                {flowType === "unhappy" && (
                    <Card withBorder>
                        <Title order={4} mb="md">
                            Select Error Scenario
                        </Title>
                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                            {UNHAPPY_FLOWS.map((scenario) => (
                                <Paper
                                    key={scenario.id}
                                    p="sm"
                                    withBorder
                                    style={{
                                        cursor: "pointer",
                                        borderColor:
                                            selectedScenario.id === scenario.id
                                                ? `var(--mantine-color-${scenario.color}-6)`
                                                : undefined,
                                        backgroundColor:
                                            selectedScenario.id === scenario.id
                                                ? `var(--mantine-color-${scenario.color}-light)`
                                                : undefined,
                                    }}
                                    onClick={() => {
                                        setSelectedScenario(scenario);
                                        resetDemo();
                                    }}
                                >
                                    <Group gap="sm">
                                        <ThemeIcon size="lg" color={scenario.color} variant="light">
                                            <scenario.icon size={18} />
                                        </ThemeIcon>
                                        <div style={{ flex: 1 }}>
                                            <Group gap="xs">
                                                <Badge color={scenario.color} size="sm">
                                                    {scenario.code}
                                                </Badge>
                                                <Text size="sm" fw={500}>
                                                    {scenario.name}
                                                </Text>
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                {scenario.description}
                                            </Text>
                                        </div>
                                    </Group>
                                </Paper>
                            ))}
                        </SimpleGrid>
                    </Card>
                )}

                {/* Current Scenario Info */}
                <Alert
                    icon={<selectedScenario.icon size={20} />}
                    title={`${selectedScenario.code}: ${selectedScenario.name}`}
                    color={selectedScenario.color}
                >
                    <Text size="sm">{selectedScenario.description}</Text>
                    <Group gap="md" mt="xs">
                        <Text size="xs">
                            <strong>Trigger:</strong> <Code>{selectedScenario.trigger}</Code>
                        </Text>
                        <Text size="xs">
                            <strong>Where:</strong> {selectedScenario.where}
                        </Text>
                    </Group>
                </Alert>

                {/* Main Content: Stepper + Messages Side by Side */}
                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                    {/* Left: Payment Stepper */}
                    <Card withBorder>
                        <Group justify="space-between" mb="md">
                            <Title order={4}>Payment Lifecycle</Title>
                            <Group gap="xs">
                                <Button
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconRefresh size={14} />}
                                    onClick={resetDemo}
                                    disabled={isRunning}
                                >
                                    Reset
                                </Button>
                                <Button
                                    leftSection={isRunning ? <Loader size={14} /> : <IconPlayerPlay size={14} />}
                                    onClick={runDemo}
                                    disabled={isRunning}
                                    color={flowType === "happy" ? "green" : "orange"}
                                >
                                    {isRunning ? "Running..." : "Run Demo"}
                                </Button>
                            </Group>
                        </Group>

                        <Stepper
                            active={activeStep}
                            orientation="vertical"
                            color={flowType === "happy" ? "green" : activeStep >= 4 ? "red" : "blue"}
                        >
                            <Stepper.Step
                                label="Payment Initiation"
                                description="S-PSP submits pacs.008"
                                icon={<IconSend size={18} />}
                            />
                            <Stepper.Step
                                label="Quote Validation"
                                description="Nexus validates FX quote"
                                icon={<IconCurrencyDollar size={18} />}
                            />
                            <Stepper.Step
                                label="Proxy Resolution"
                                description="PDO resolves beneficiary"
                                icon={<IconUser size={18} />}
                            />
                            <Stepper.Step
                                label="Payment Processing"
                                description="D-IPS processes credit"
                                icon={<IconArrowRight size={18} />}
                            />
                            <Stepper.Step
                                label={flowType === "happy" ? "Settlement Confirmed" : "Payment Rejected"}
                                description={flowType === "happy" ? "ACCC status received" : `${selectedScenario.code} returned`}
                                icon={flowType === "happy" ? <IconCheck size={18} /> : <IconX size={18} />}
                                color={flowType === "happy" ? "green" : "red"}
                            />
                            <Stepper.Completed>
                                <Alert
                                    color={flowType === "happy" ? "green" : "red"}
                                    title={flowType === "happy" ? "Payment Successful" : "Payment Failed"}
                                    mt="md"
                                >
                                    {flowType === "happy"
                                        ? "The payment completed with ACCC (Accepted Settlement Completed) status."
                                        : `The payment was rejected with ${selectedScenario.code} (${selectedScenario.name}).`}
                                </Alert>
                            </Stepper.Completed>
                        </Stepper>
                    </Card>

                    {/* Right: Message Log */}
                    <Card withBorder>
                        <Group justify="space-between" mb="md">
                            <Title order={4}>Message Observatory</Title>
                            <Badge variant="dot" color={messages.length > 0 ? "green" : "gray"}>
                                {messages.length} messages
                            </Badge>
                        </Group>

                        {messages.length === 0 ? (
                            <Paper p="xl" bg="dark.7" ta="center">
                                <IconMessageDots size={48} opacity={0.3} />
                                <Text c="dimmed" mt="sm">
                                    Click "Run Demo" to see ISO 20022 messages
                                </Text>
                            </Paper>
                        ) : (
                            <Timeline active={messages.length - 1} bulletSize={24} lineWidth={2}>
                                {messages.map((msg) => (
                                    <Timeline.Item
                                        key={msg.id}
                                        bullet={
                                            msg.status === "ACCC" ? (
                                                <IconCheck size={12} />
                                            ) : msg.status === "RJCT" ? (
                                                <IconX size={12} />
                                            ) : (
                                                <IconFileCode size={12} />
                                            )
                                        }
                                        color={msg.status === "ACCC" ? "green" : msg.status === "RJCT" ? "red" : "blue"}
                                        title={
                                            <Group gap="xs">
                                                <Badge size="xs" variant="light">
                                                    {msg.messageType}
                                                </Badge>
                                                <Text size="xs" c="dimmed">
                                                    {msg.direction === "inbound" ? "←" : "→"} {msg.actor}
                                                </Text>
                                            </Group>
                                        }
                                    >
                                        <Text size="sm" mt={4}>
                                            {msg.summary}
                                        </Text>
                                        {msg.xml && (
                                            <Button
                                                variant="subtle"
                                                size="compact-xs"
                                                leftSection={<IconEye size={12} />}
                                                mt="xs"
                                                onClick={() => viewMessage(msg)}
                                            >
                                                View XML
                                            </Button>
                                        )}
                                    </Timeline.Item>
                                ))}
                            </Timeline>
                        )}
                    </Card>
                </SimpleGrid>

                {/* Trigger Values Reference */}
                <Accordion variant="contained">
                    <Accordion.Item value="triggers">
                        <Accordion.Control icon={<IconAlertTriangle size={20} />}>
                            Trigger Values Reference
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Table striped highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Code</Table.Th>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th>Trigger Value</Table.Th>
                                        <Table.Th>Apply To</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {UNHAPPY_FLOWS.map((flow) => (
                                        <Table.Tr key={flow.id}>
                                            <Table.Td>
                                                <Badge color={flow.color}>{flow.code}</Badge>
                                            </Table.Td>
                                            <Table.Td>{flow.name}</Table.Td>
                                            <Table.Td>
                                                <Code>{flow.trigger}</Code>
                                            </Table.Td>
                                            <Table.Td>{flow.where}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>

                {/* Quick Actions */}
                <Group justify="center" gap="md">
                    <Button variant="light" leftSection={<IconSend size={16} />} onClick={() => navigate("/payment")}>
                        Go to Real Payment
                    </Button>
                    <Button
                        variant="light"
                        color="orange"
                        leftSection={<IconMessageDots size={16} />}
                        onClick={() => navigate("/service-desk")}
                    >
                        Service Desk (Disputes)
                    </Button>
                    <Button
                        variant="light"
                        color="blue"
                        leftSection={<IconFileCode size={16} />}
                        onClick={() => navigate("/messages")}
                    >
                        Full Message Explorer
                    </Button>
                </Group>
            </Stack>

            {/* XML Viewer Drawer */}
            <Drawer
                opened={drawerOpened}
                onClose={closeDrawer}
                title={
                    <Group gap="sm">
                        <IconFileCode size={20} />
                        <Text fw={500}>{selectedMessage?.messageType} Message</Text>
                    </Group>
                }
                position="right"
                size="lg"
            >
                {selectedMessage?.xml && (
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Group gap="xs">
                                <Badge>{selectedMessage.messageType}</Badge>
                                <Badge variant="outline" color={selectedMessage.direction === "inbound" ? "blue" : "green"}>
                                    {selectedMessage.direction}
                                </Badge>
                                {selectedMessage.status && (
                                    <Badge color={selectedMessage.status === "ACCC" ? "green" : "red"}>
                                        {selectedMessage.status}
                                    </Badge>
                                )}
                            </Group>
                            <CopyButton value={selectedMessage.xml}>
                                {({ copied, copy }) => (
                                    <Tooltip label={copied ? "Copied!" : "Copy XML"}>
                                        <ActionIcon variant="light" onClick={copy}>
                                            <IconCopy size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        </Group>

                        <Text size="xs" c="dimmed">
                            Actor: {selectedMessage.actor} • {new Date(selectedMessage.timestamp).toLocaleTimeString()}
                        </Text>

                        <Divider />

                        <ScrollArea h={500}>
                            <CodeHighlight code={selectedMessage.xml} language="xml" />
                        </ScrollArea>
                    </Stack>
                )}
            </Drawer>
        </Container>
    );
}
