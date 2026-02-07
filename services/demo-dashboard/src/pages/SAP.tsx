import {
    Title,
    Card,
    Stack,
    Group,
    Text,
    Badge,
    Table,
    SimpleGrid,
    RingProgress,
    ThemeIcon,
    Anchor,
    Breadcrumbs,
    Alert,
    Loader,
    Tabs,
} from "@mantine/core";
import {
    IconCoin,
    IconLock,
    IconCheck,
    IconAlertTriangle,
    IconInfoCircle,
    IconArrowsExchange,
    IconReceipt,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { DevDebugPanel } from "../components/DevDebugPanel";
import {
    getSAPNostroAccounts,
    getSAPReservations,
    getSAPTransactions,
    getSAPReconciliation,
    type NostroAccount,
    type SAPReservation,
    type SAPTransaction,
    type ReconciliationReport,
} from "../services/api";

function useCountdown(targetDate: string) {
    const [timeLeft, setTimeLeft] = useState<number>(0);

    useEffect(() => {
        const update = () => {
            const diff = Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000));
            setTimeLeft(diff);
        };
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [targetDate]);

    return timeLeft;
}

function CountdownBadge({ targetDate }: { targetDate: string }) {
    const seconds = useCountdown(targetDate);
    return (
        <Badge size="sm" variant="outline" color={seconds < 30 ? "red" : "blue"}>
            {seconds}s
        </Badge>
    );
}


export function SAPPage() {
    const [accounts, setAccounts] = useState<NostroAccount[]>([]);
    const [reservations, setReservations] = useState<SAPReservation[]>([]);
    const [transactions, setTransactions] = useState<SAPTransaction[]>([]);
    const [reconciliation, setReconciliation] = useState<ReconciliationReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const [accts, reservs, txns, recon] = await Promise.all([
                    getSAPNostroAccounts(),
                    getSAPReservations(),
                    getSAPTransactions(20),
                    getSAPReconciliation(),
                ]);
                setAccounts(accts);
                setReservations(reservs);
                setTransactions(txns);
                setReconciliation(recon);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load SAP data");
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance || "0"), 0);
    const totalReserved = reservations.reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0);
    const totalAvailable = totalBalance - totalReserved;
    const reservedPercent = totalBalance > 0 ? (totalReserved / totalBalance) * 100 : 0;

    if (loading) {
        return (
            <Stack align="center" justify="center" h={400}>
                <Loader size="lg" />
                <Text c="dimmed">Loading SAP data...</Text>
            </Stack>
        );
    }

    if (error) {
        return (
            <Alert color="red" title="Error loading SAP data">
                {error}
            </Alert>
        );
    }

    return (
        <Stack gap="md">
            <Breadcrumbs mb="xs">
                <Anchor href="/actors" size="xs">Actor Registry</Anchor>
                <Text size="xs" c="dimmed">Liquidity Management</Text>
            </Breadcrumbs>
            <Group justify="space-between">
                <Title order={2}>Settlement Access Provider (SAP) Dashboard</Title>
                <Group>
                    <Anchor href="/fxp" size="sm">View FX Rates (FXP)</Anchor>
                    <Badge color="green" variant="light" leftSection={<IconCoin size={14} />}>
                        SAP View
                    </Badge>
                </Group>
            </Group>

            {/* SAP Role Explanation */}
            <Alert icon={<IconInfoCircle size={18} />} title="What is a Settlement Access Provider (SAP)?" color="green" variant="light">
                <Text size="sm">
                    SAPs are banks that hold <strong>settlement accounts</strong> (nostro accounts) on behalf of FXPs.
                    They manage liquidity reservations for quoted payments and facilitate final settlement through
                    the domestic IPS. SAPs ensure FXPs have sufficient funds before payments are executed.
                </Text>
                <Anchor href="https://docs.nexusglobalpayments.org/settlement-access-provision/role-of-the-settlement-access-provider-sap" size="xs" mt="xs">
                    Learn more in Nexus Documentation →
                </Anchor>
            </Alert>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                <Card>
                    <Group justify="space-between" mb="xs">
                        <Text c="dimmed" size="sm">Total Balance</Text>
                        <ThemeIcon variant="light" color="blue">
                            <IconCoin size={16} />
                        </ThemeIcon>
                    </Group>
                    <Title order={3}>{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Title>
                    <Text size="xs" c="dimmed">{accounts.length} nostro accounts</Text>
                </Card>

                <Card>
                    <Group justify="space-between" mb="xs">
                        <Text c="dimmed" size="sm">Reserved</Text>
                        <ThemeIcon variant="light" color="yellow">
                            <IconLock size={16} />
                        </ThemeIcon>
                    </Group>
                    <Title order={3}>{totalReserved.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Title>
                    <Text size="xs" c="dimmed">{reservations.length} active reservations</Text>
                </Card>

                <Card>
                    <Group justify="space-between" mb="xs">
                        <Text c="dimmed" size="sm">Available</Text>
                        <ThemeIcon variant="light" color="green">
                            <IconCheck size={16} />
                        </ThemeIcon>
                    </Group>
                    <Title order={3}>{totalAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Title>
                </Card>
            </SimpleGrid>

            {/* Utilization Ring */}
            <Card>
                <Group>
                    <RingProgress
                        size={100}
                        thickness={10}
                        sections={[
                            { value: reservedPercent, color: "yellow" },
                            { value: 100 - reservedPercent, color: "green" },
                        ]}
                        label={
                            <Text ta="center" size="xs" fw={700}>
                                {reservedPercent.toFixed(0)}%
                            </Text>
                        }
                    />
                    <Stack gap={0}>
                        <Text size="sm" fw={500}>Liquidity Utilization</Text>
                        <Text size="xs" c="dimmed">
                            {reservedPercent.toFixed(1)}% reserved across all FXPs
                        </Text>
                    </Stack>
                </Group>
            </Card>

            <Tabs defaultValue="accounts">
                <Tabs.List>
                    <Tabs.Tab value="accounts" leftSection={<IconCoin size={14} />}>Nostro Accounts</Tabs.Tab>
                    <Tabs.Tab value="reservations" leftSection={<IconLock size={14} />}>Reservations ({reservations.length})</Tabs.Tab>
                    <Tabs.Tab value="transactions" leftSection={<IconArrowsExchange size={14} />}>Transactions</Tabs.Tab>
                    <Tabs.Tab value="reconciliation" leftSection={<IconReceipt size={14} />}>Reconciliation</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="accounts" pt="md">
                    <Card>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>FXP</Table.Th>
                                    <Table.Th>Currency</Table.Th>
                                    <Table.Th>Balance</Table.Th>
                                    <Table.Th>Account</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {accounts.map((a) => (
                                    <Table.Tr key={a.accountId}>
                                        <Table.Td fw={500}>{a.fxpName || a.fxpBic}</Table.Td>
                                        <Table.Td>{a.currency}</Table.Td>
                                        <Table.Td>{parseFloat(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                        <Table.Td><Text size="xs" ff="monospace">{a.accountNumber}</Text></Table.Td>
                                        <Table.Td>
                                            <Badge color={a.status === "ACTIVE" ? "green" : a.status === "LOW" ? "yellow" : "red"}
                                                leftSection={a.status === "LOW" ? <IconAlertTriangle size={12} /> : null}>
                                                {a.status}
                                            </Badge>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {accounts.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center" py="md">No nostro accounts found</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="reservations" pt="md">
                    <Card>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>UETR</Table.Th>
                                    <Table.Th>Amount</Table.Th>
                                    <Table.Th>Currency</Table.Th>
                                    <Table.Th>Expires</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {reservations.map((res) => (
                                    <Table.Tr key={res.reservationId}>
                                        <Table.Td><Text size="sm" ff="monospace">{res.uetr?.substring(0, 12)}...</Text></Table.Td>
                                        <Table.Td>{parseFloat(res.amount).toLocaleString()}</Table.Td>
                                        <Table.Td>{res.currency}</Table.Td>
                                        <Table.Td>
                                            {res.expiresAt ? <CountdownBadge targetDate={res.expiresAt} /> : "—"}
                                        </Table.Td>
                                        <Table.Td><Badge color="green" size="sm">{res.status}</Badge></Table.Td>
                                    </Table.Tr>
                                ))}
                                {reservations.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center" py="md">No active reservations</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="transactions" pt="md">
                    <Card>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Type</Table.Th>
                                    <Table.Th>Amount</Table.Th>
                                    <Table.Th>Currency</Table.Th>
                                    <Table.Th>Reference</Table.Th>
                                    <Table.Th>Date</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {transactions.map((tx) => (
                                    <Table.Tr key={tx.transactionId}>
                                        <Table.Td>
                                            <Badge color={tx.type === "CREDIT" ? "green" : "red"} size="sm">{tx.type}</Badge>
                                        </Table.Td>
                                        <Table.Td>{parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                        <Table.Td>{tx.currency}</Table.Td>
                                        <Table.Td><Text size="xs" ff="monospace">{tx.reference?.substring(0, 16)}</Text></Table.Td>
                                        <Table.Td><Text size="xs">{new Date(tx.createdAt).toLocaleString()}</Text></Table.Td>
                                    </Table.Tr>
                                ))}
                                {transactions.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center" py="md">No transactions yet</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="reconciliation" pt="md">
                    <Card>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Currency</Table.Th>
                                    <Table.Th>Opening</Table.Th>
                                    <Table.Th>Credits</Table.Th>
                                    <Table.Th>Debits</Table.Th>
                                    <Table.Th>Closing</Table.Th>
                                    <Table.Th>Txns</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {reconciliation.map((r, i) => (
                                    <Table.Tr key={i}>
                                        <Table.Td fw={500}>{r.currency}</Table.Td>
                                        <Table.Td>{parseFloat(r.openingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                        <Table.Td c="green">{parseFloat(r.totalCredits).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                        <Table.Td c="red">{parseFloat(r.totalDebits).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                        <Table.Td fw={600}>{parseFloat(r.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                        <Table.Td>{r.transactionCount}</Table.Td>
                                    </Table.Tr>
                                ))}
                                {reconciliation.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="md">No reconciliation data for today</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Card>
                </Tabs.Panel>
            </Tabs>

            {/* Developer Debug Panel for SAP Actor */}
            <DevDebugPanel context={{ actorType: "SAP", actorName: "Settlement Access Provider" }} showToggle={true} />
        </Stack>
    );
}
