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
    Tooltip,
} from "@mantine/core";
import {
    IconCoin,
    IconLock,
    IconCheck,
    IconAlertTriangle,
    IconInfoCircle,
    IconArrowsExchange,
    IconReceipt,
    IconHistory,
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
    // Only ACTIVE reservations lock funds — EXPIRED/UTILIZED/CANCELLED have released theirs
    const activeReservations = reservations.filter(r => r.status === "ACTIVE" || r.status === "PENDING");
    const totalReserved = activeReservations.reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0);
    const totalAvailable = totalBalance - totalReserved;
    const reservedPercent = totalBalance > 0 ? (totalReserved / totalBalance) * 100 : 0;

    // Per-currency breakdown — aggregation across currencies is misleading
    const currencyBreakdown = (() => {
        const byCurrency: Record<string, { balance: number; reserved: number }> = {};
        accounts.forEach(a => {
            const c = a.currency || "???";
            if (!byCurrency[c]) byCurrency[c] = { balance: 0, reserved: 0 };
            byCurrency[c].balance += parseFloat(a.balance || "0");
        });
        activeReservations.forEach(r => {
            const c = r.currency || "???";
            if (!byCurrency[c]) byCurrency[c] = { balance: 0, reserved: 0 };
            byCurrency[c].reserved += parseFloat(r.amount || "0");
        });
        return Object.entries(byCurrency)
            .map(([currency, { balance, reserved }]) => ({ currency, balance, reserved, available: balance - reserved }))
            .sort((a, b) => b.balance - a.balance);
    })();

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
                        <Tooltip
                            label="Aggregate sum across all currencies. Individual currency balances shown below."
                            multiline
                            w={280}
                            withArrow
                        >
                            <Text c="dimmed" size="sm" style={{ cursor: "help", borderBottom: "1px dotted var(--mantine-color-dimmed)" }}>Total Balance (Multi-Currency)</Text>
                        </Tooltip>
                        <ThemeIcon variant="light" color="blue">
                            <IconCoin size={16} />
                        </ThemeIcon>
                    </Group>
                    <Title order={3}>{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Title>
                    <Text size="xs" c="dimmed">{accounts.length} nostro accounts · {currencyBreakdown.length} currencies</Text>
                </Card>

                <Card>
                    <Group justify="space-between" mb="xs">
                        <Tooltip
                            label="Total funds locked via camt.103 CreateReservation across all currencies for in-flight payments."
                            multiline
                            w={300}
                            withArrow
                        >
                            <Text c="dimmed" size="sm" style={{ cursor: "help", borderBottom: "1px dotted var(--mantine-color-dimmed)" }}>Reserved (Multi-Currency)</Text>
                        </Tooltip>
                        <ThemeIcon variant="light" color="yellow">
                            <IconLock size={16} />
                        </ThemeIcon>
                    </Group>
                    <Title order={3}>{totalReserved.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Title>
                    <Text size="xs" c="dimmed">{activeReservations.length} active reservations</Text>
                </Card>

                <Card>
                    <Group justify="space-between" mb="xs">
                        <Tooltip
                            label="Unreserved balance across all currencies."
                            multiline
                            w={280}
                            withArrow
                        >
                            <Text c="dimmed" size="sm" style={{ cursor: "help", borderBottom: "1px dotted var(--mantine-color-dimmed)" }}>Available (Multi-Currency)</Text>
                        </Tooltip>
                        <ThemeIcon variant="light" color="green">
                            <IconCheck size={16} />
                        </ThemeIcon>
                    </Group>
                    <Title order={3}>{totalAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Title>
                </Card>
            </SimpleGrid>

            {/* Per-Currency Breakdown */}
            <Card>
                <Text size="sm" fw={600} mb="sm">Liquidity by Currency</Text>
                <Table.ScrollContainer minWidth={500}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Currency</Table.Th>
                                <Table.Th>Balance</Table.Th>
                                <Table.Th>Reserved</Table.Th>
                                <Table.Th>Available</Table.Th>
                                <Table.Th>Utilization</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {currencyBreakdown.map(({ currency, balance, reserved, available }) => (
                                <Table.Tr key={currency}>
                                    <Table.Td><Badge variant="light">{currency}</Badge></Table.Td>
                                    <Table.Td>{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                    <Table.Td>{reserved > 0 ? reserved.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</Table.Td>
                                    <Table.Td fw={500}>{available.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                    <Table.Td>
                                        <Badge size="sm" color={balance > 0 && (reserved / balance) > 0.8 ? "red" : balance > 0 && (reserved / balance) > 0.5 ? "yellow" : "green"}>
                                            {balance > 0 ? ((reserved / balance) * 100).toFixed(1) : "0.0"}%
                                        </Badge>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Card>

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
                        <Tooltip
                            label="Aggregate utilization across all currencies. For per-currency utilization, see the table above."
                            multiline
                            w={280}
                            withArrow
                        >
                            <Text size="sm" fw={500} style={{ cursor: "help", borderBottom: "1px dotted var(--mantine-color-dimmed)" }}>
                                Aggregate Liquidity Utilization
                            </Text>
                        </Tooltip>
                        <Text size="xs" c="dimmed">
                            {reservedPercent.toFixed(1)}% reserved across {currencyBreakdown.length} currencies
                        </Text>
                    </Stack>
                </Group>
            </Card>

            <Tabs defaultValue="accounts">
                <Tabs.List>
                    <Tabs.Tab value="accounts" leftSection={<IconCoin size={14} />}>Nostro Accounts</Tabs.Tab>
                    <Tabs.Tab value="reservations" leftSection={<IconLock size={14} />}>Reservations ({activeReservations.length})</Tabs.Tab>
                    <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>Reservation History</Tabs.Tab>
                    <Tabs.Tab value="transactions" leftSection={<IconArrowsExchange size={14} />}>Transactions</Tabs.Tab>
                    <Tabs.Tab value="reconciliation" leftSection={<IconReceipt size={14} />}>Reconciliation</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="accounts" pt="md">
                    <Card>
                        <Table.ScrollContainer minWidth={600}>
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
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                {/* Active Reservations — funds currently locked via camt.103 */}
                <Tabs.Panel value="reservations" pt="md">
                    <Card>
                        <Table.ScrollContainer minWidth={550}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>
                                            <Tooltip label="Unique End-to-End Transaction Reference — tracks this payment across all Nexus actors" withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>UETR</Text>
                                            </Tooltip>
                                        </Table.Th>
                                        <Table.Th>Amount</Table.Th>
                                        <Table.Th>Currency</Table.Th>
                                        <Table.Th>
                                            <Tooltip label="Reservation TTL — if no pacs.002 confirmation arrives before expiry, the D-IPS rejects the transaction and the reservation is cancelled" multiline w={280} withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Expires</Text>
                                            </Tooltip>
                                        </Table.Th>
                                        <Table.Th>
                                            <Tooltip label="ACTIVE = camt.103 funds locked for in-flight payment, PENDING = reservation being created" multiline w={280} withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Status</Text>
                                            </Tooltip>
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {activeReservations.map((res) => (
                                        <Table.Tr key={res.reservationId}>
                                            <Table.Td><Text size="sm" ff="monospace">{res.uetr?.substring(0, 12)}...</Text></Table.Td>
                                            <Table.Td>{parseFloat(res.amount).toLocaleString()}</Table.Td>
                                            <Table.Td>{res.currency}</Table.Td>
                                            <Table.Td>
                                                {res.expiresAt ? <CountdownBadge targetDate={res.expiresAt} /> : "—"}
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge color={res.status === "ACTIVE" ? "green" : "yellow"} size="sm">
                                                    {res.status}
                                                </Badge>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {activeReservations.length === 0 && (
                                        <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center" py="md">No active reservations — all funds are available</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                {/* Reservation History — settled, expired, or cancelled */}
                <Tabs.Panel value="history" pt="md">
                    <Card>
                        <Text size="sm" c="dimmed" mb="sm">Completed reservation lifecycle entries — funds have been released or debited</Text>
                        <Table.ScrollContainer minWidth={650}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>UETR</Table.Th>
                                        <Table.Th>SAP</Table.Th>
                                        <Table.Th>Amount</Table.Th>
                                        <Table.Th>Currency</Table.Th>
                                        <Table.Th>Reserved At</Table.Th>
                                        <Table.Th>
                                            <Tooltip label="UTILIZED = settled (funds debited from nostro), EXPIRED = timed out (funds released), CANCELLED = payment rejected (funds released)" multiline w={300} withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Outcome</Text>
                                            </Tooltip>
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {reservations
                                        .filter(r => r.status !== "ACTIVE" && r.status !== "PENDING")
                                        .sort((a, b) => {
                                            const ta = a.reservedAt ? new Date(a.reservedAt).getTime() : 0;
                                            const tb = b.reservedAt ? new Date(b.reservedAt).getTime() : 0;
                                            return tb - ta; // most recent first
                                        })
                                        .map((res) => (
                                            <Table.Tr key={res.reservationId}>
                                                <Table.Td><Text size="sm" ff="monospace">{res.uetr?.substring(0, 12)}...</Text></Table.Td>
                                                <Table.Td><Text size="sm" fw={500}>{res.sapBic || "—"}</Text></Table.Td>
                                                <Table.Td>{parseFloat(res.amount).toLocaleString()}</Table.Td>
                                                <Table.Td>{res.currency}</Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">
                                                        {res.reservedAt
                                                            ? new Date(res.reservedAt).toLocaleString(undefined, {
                                                                year: "numeric", month: "short", day: "numeric",
                                                                hour: "2-digit", minute: "2-digit", second: "2-digit"
                                                            })
                                                            : "—"
                                                        }
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={
                                                            res.status === "UTILIZED" ? "blue" :
                                                                res.status === "EXPIRED" ? "gray" :
                                                                    res.status === "CANCELLED" ? "red" : "gray"
                                                        }
                                                        size="sm"
                                                    >
                                                        {res.status}
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    {reservations.filter(r => r.status !== "ACTIVE" && r.status !== "PENDING").length === 0 && (
                                        <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="md">No reservation history yet</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="transactions" pt="md">
                    <Card>
                        <Table.ScrollContainer minWidth={600}>
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
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="reconciliation" pt="md">
                    <Card>
                        <Table.ScrollContainer minWidth={650}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Account</Table.Th>
                                        <Table.Th>Currency</Table.Th>
                                        <Table.Th>
                                            <Tooltip label="Account balance at start of reconciliation period" withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Opening</Text>
                                            </Tooltip>
                                        </Table.Th>
                                        <Table.Th>
                                            <Tooltip label="Funds received from Source PSPs via the domestic IPS (credited to FXP's nostro account)" multiline w={260} withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Credits</Text>
                                            </Tooltip>
                                        </Table.Th>
                                        <Table.Th>
                                            <Tooltip label="Funds debited from FXP's account to pay Destination PSPs. SAPs must transfer the exact Interbank Settlement Amount — fees cannot be deducted from payments." multiline w={280} withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Debits</Text>
                                            </Tooltip>
                                        </Table.Th>
                                        <Table.Th>
                                            <Tooltip label="Balance after all credits and debits. SAP must reconcile this with the D-IPS settlement report." multiline w={260} withArrow>
                                                <Text size="sm" fw={600} style={{ cursor: "help" }}>Closing</Text>
                                            </Tooltip>
                                        </Table.Th>
                                        <Table.Th>Txns</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {reconciliation.map((r, i) => (
                                        <Table.Tr key={i}>
                                            <Table.Td>
                                                <Text size="sm" fw={600}>{r.sapBic || '—'}</Text>
                                                {r.fxpCode && <Text size="xs" c="dimmed">{r.fxpCode}</Text>}
                                            </Table.Td>
                                            <Table.Td fw={500}>{r.currency}</Table.Td>
                                            <Table.Td>{parseFloat(r.openingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            <Table.Td c="green">{parseFloat(r.totalCredits).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            <Table.Td c="red">{parseFloat(r.totalDebits).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            <Table.Td fw={600}>{parseFloat(r.closingBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            <Table.Td>{r.transactionCount}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {reconciliation.length === 0 && (
                                        <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center" py="md">No reconciliation data for today</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>
            </Tabs>

            {/* Developer Debug Panel for SAP Actor */}
            <DevDebugPanel context={{ actorType: "SAP", actorName: "Settlement Access Provider" }} showToggle={true} />
        </Stack>
    );
}
