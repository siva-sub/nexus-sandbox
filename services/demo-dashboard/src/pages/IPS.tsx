import { useState, useEffect } from "react";
import {
    Title,
    Card,
    Stack,
    Group,
    Text,
    Badge,
    Table,
    Select,
    Anchor,
    Breadcrumbs,
    Alert,
    Loader,
    SimpleGrid,
    Code,
} from "@mantine/core";
import {
    IconNetwork,
    IconInfoCircle,
    IconClock,
} from "@tabler/icons-react";
import { getIPSOperators, getIPSMembers, type IPSOperator } from "../services/api";
import { DevDebugPanel } from "../components/DevDebugPanel";

export function IPSPage() {
    const [operators, setOperators] = useState<IPSOperator[]>([]);
    const [selectedIPS, setSelectedIPS] = useState<string | null>(null);
    const [members, setMembers] = useState<{ bic: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [membersLoading, setMembersLoading] = useState(false);

    useEffect(() => {
        loadOperators();
    }, []);

    useEffect(() => {
        if (selectedIPS) {
            loadMembers(selectedIPS);
        }
    }, [selectedIPS]);

    const loadOperators = async () => {
        setLoading(true);
        try {
            const data = await getIPSOperators();
            setOperators(data.operators);
            if (data.operators.length > 0) {
                setSelectedIPS(data.operators[0].clearing_system_id);
            }
        } catch (e) {
            console.error("Failed to load IPS operators:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadMembers = async (clearingSystemId: string) => {
        setMembersLoading(true);
        try {
            const data = await getIPSMembers(clearingSystemId);
            setMembers(data.members);
        } catch (e) {
            console.error("Failed to load IPS members:", e);
            setMembers([]);
        } finally {
            setMembersLoading(false);
        }
    };

    const selectedOperator = operators.find((o) => o.clearing_system_id === selectedIPS);

    const formatAmount = (amount: number, currency: string) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <Stack gap="md">
            <Breadcrumbs mb="xs">
                <Anchor href="/actors" size="xs">Actor Registry</Anchor>
                <Text size="xs" c="dimmed">Instant Payment Systems</Text>
            </Breadcrumbs>

            <Group justify="space-between">
                <Title order={2}>Instant Payment System (IPS) Dashboard</Title>
                <Badge color="violet" variant="light" leftSection={<IconNetwork size={14} />}>
                    IPS View
                </Badge>
            </Group>

            {/* IPS Role Explanation */}
            <Alert icon={<IconInfoCircle size={18} />} title="What is an Instant Payment System (IPS)?" color="violet" variant="light">
                <Text size="sm">
                    An IPS (or IPSO - Instant Payment System Operator) operates the domestic real-time payment
                    infrastructure in each country. Examples include <strong>FAST</strong> (Singapore),{" "}
                    <strong>PromptPay</strong> (Thailand), <strong>DuitNow</strong> (Malaysia), and{" "}
                    <strong>UPI</strong> (India). Nexus connects these systems to enable cross-border instant payments.
                </Text>
                <Anchor href="https://docs.nexusglobalpayments.org/payment-processing/role-and-responsibilities-of-the-instant-payment-system-operator-ipso" size="xs" mt="xs">
                    Learn more in Nexus Documentation →
                </Anchor>
            </Alert>

            {/* IPS Selection */}
            <Select
                label="Select IPS Operator"
                placeholder="Choose an IPS to view"
                data={operators.map((o) => ({
                    value: o.clearing_system_id,
                    label: `${o.name} (${o.country_code})`,
                }))}
                value={selectedIPS}
                onChange={setSelectedIPS}
                w={400}
            />

            {loading ? (
                <Card p="xl" ta="center">
                    <Loader />
                    <Text c="dimmed" mt="md">Loading IPS operators...</Text>
                </Card>
            ) : selectedOperator ? (
                <SimpleGrid cols={{ base: 1, lg: 2 }}>
                    <Card>
                        <Title order={5} mb="md">IPS Details</Title>
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Text c="dimmed">Name</Text>
                                <Text fw={500}>{selectedOperator.name}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text c="dimmed">Country</Text>
                                <Badge size="lg">{selectedOperator.country_code}</Badge>
                            </Group>
                            <Group justify="space-between">
                                <Text c="dimmed">Clearing System ID</Text>
                                <Code>{selectedOperator.clearing_system_id}</Code>
                            </Group>
                            <Group justify="space-between">
                                <Text c="dimmed">Currency</Text>
                                <Text>{selectedOperator.currency_code}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text c="dimmed">Max Transaction</Text>
                                <Text fw={500}>{formatAmount(selectedOperator.max_amount, selectedOperator.currency_code)}</Text>
                            </Group>
                        </Stack>
                    </Card>

                    <Card>
                        <Title order={5} mb="md">IPSO Responsibilities</Title>
                        <Stack gap="xs">
                            <Text size="sm">• Operate domestic clearing and settlement</Text>
                            <Text size="sm">• Route payments between PSPs</Text>
                            <Text size="sm">• Enforce domestic transaction limits</Text>
                            <Text size="sm">• Connect to Nexus for cross-border routing</Text>
                            <Text size="sm">• Provide message translation to ISO 20022</Text>
                        </Stack>

                        <Group mt="lg" gap="xs">
                            <IconClock size={14} />
                            <Text size="xs" c="dimmed">Settlement typically &lt;60 seconds</Text>
                        </Group>
                    </Card>

                    <Card style={{ gridColumn: "span 2" }}>
                        <Title order={5} mb="md">Connected PSPs ({members.length})</Title>
                        {membersLoading ? (
                            <Loader size="sm" />
                        ) : members.length > 0 ? (
                            <Table.ScrollContainer minWidth={400}>
                                <Table>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>BIC</Table.Th>
                                            <Table.Th>Name</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {members.map((m) => (
                                            <Table.Tr key={m.bic}>
                                                <Table.Td><Code>{m.bic}</Code></Table.Td>
                                                <Table.Td>{m.name}</Table.Td>
                                                <Table.Td><Badge color="green" size="sm">Active</Badge></Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        ) : (
                            <Text c="dimmed">No PSPs found for this IPS</Text>
                        )}
                    </Card>
                </SimpleGrid>
            ) : (
                <Card p="xl" ta="center">
                    <Text c="dimmed">Select an IPS operator to view details</Text>
                </Card>
            )}

            {/* All IPS Table */}
            <Card>
                <Title order={5} mb="md">All IPS Operators ({operators.length})</Title>
                <Table.ScrollContainer minWidth={600}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Country</Table.Th>
                                <Table.Th>Clearing System ID</Table.Th>
                                <Table.Th>Currency</Table.Th>
                                <Table.Th>Max Amount</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {operators.map((op) => (
                                <Table.Tr key={op.clearing_system_id}>
                                    <Table.Td>{op.name}</Table.Td>
                                    <Table.Td><Badge size="sm">{op.country_code}</Badge></Table.Td>
                                    <Table.Td><Code>{op.clearing_system_id}</Code></Table.Td>
                                    <Table.Td>{op.currency_code}</Table.Td>
                                    <Table.Td>{formatAmount(op.max_amount, op.currency_code)}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Card>

            {/* Developer Debug Panel for IPS Actor */}
            <DevDebugPanel context={{ actorType: "IPS", actorName: "Instant Payment System" }} showToggle={true} />
        </Stack>
    );
}
