import { useState, useEffect } from "react";
import {
    Title,
    Card,
    Stack,
    Group,
    Select,
    NumberInput,
    Button,
    Text,
    Badge,
    Table,
    Tabs,
    SimpleGrid,
    Anchor,
    Breadcrumbs,
    Alert,
    Loader,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconArrowsExchange,
    IconPlus,
    IconRefresh,
    IconClock,
    IconInfoCircle,
    IconHistory,
    IconUsers,
} from "@tabler/icons-react";
import { DevDebugPanel } from "../components/DevDebugPanel";
import {
    getFXPRates,
    getFXPTrades,
    getFXPPSPRelationships,
    submitRate,
    withdrawRate,
    type FXPRate,
    type FXPTrade,
    type PSPRelationship,
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

function CountdownText({ targetDate }: { targetDate: string }) {
    const seconds = useCountdown(targetDate);
    return <Text size="sm">{seconds}s</Text>;
}

const CURRENCIES = [
    { value: "SGD", label: "🇸🇬 SGD - Singapore Dollar" },
    { value: "THB", label: "🇹🇭 THB - Thai Baht" },
    { value: "MYR", label: "🇲🇾 MYR - Malaysian Ringgit" },
    { value: "PHP", label: "🇵🇭 PHP - Philippine Peso" },
    { value: "IDR", label: "🇮🇩 IDR - Indonesian Rupiah" },
    { value: "INR", label: "🇮🇳 INR - Indian Rupee" },
];

// Demo amount tier data - Per Nexus Spec
const DEMO_AMOUNT_TIERS = [
    { tierId: "T-001", minAmount: 0, maxAmount: 1000, improvementBps: 0, label: "Standard" },
    { tierId: "T-002", minAmount: 1000, maxAmount: 10000, improvementBps: 5, label: "Volume" },
    { tierId: "T-003", minAmount: 10000, maxAmount: null as number | null, improvementBps: 10, label: "Premium" },
];

export function FXPPage() {
    const [rates, setRates] = useState<FXPRate[]>([]);
    const [trades, setTrades] = useState<FXPTrade[]>([]);
    const [pspRelationships, setPspRelationships] = useState<PSPRelationship[]>([]);
    const [amountTiers, setAmountTiers] = useState(DEMO_AMOUNT_TIERS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newRate, setNewRate] = useState({
        sourceCurrency: "SGD",
        destinationCurrency: "MYR",
        rate: 3.41,
        spread: 25
    });
    const [newTier, setNewTier] = useState({ minAmount: 0, maxAmount: 1000, improvementBps: 0 });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const [ratesData, tradesData, pspData] = await Promise.all([
                getFXPRates(),
                getFXPTrades(20),
                getFXPPSPRelationships(),
            ]);
            setRates(ratesData);
            setTrades(tradesData);
            setPspRelationships(pspData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load FXP data");
        } finally {
            setLoading(false);
        }
    }

    const handleSubmitRate = async () => {
        if (newRate.sourceCurrency === newRate.destinationCurrency) {
            notifications.show({ title: "Invalid Corridor", message: "Source and destination currencies must be different", color: "red" });
            return;
        }
        try {
            await submitRate({
                sourceCurrency: newRate.sourceCurrency,
                destinationCurrency: newRate.destinationCurrency,
                rate: newRate.rate,
                spreadBps: newRate.spread,
            });
            notifications.show({ title: "Rate Submitted", message: `${newRate.sourceCurrency} → ${newRate.destinationCurrency} @ ${newRate.rate}`, color: "green" });
            // Reload rates
            const freshRates = await getFXPRates();
            setRates(freshRates);
        } catch (err) {
            notifications.show({ title: "Error", message: err instanceof Error ? err.message : "Failed to submit rate", color: "red" });
        }
    };

    const handleWithdrawRate = async (rateId: string, corridor: string) => {
        try {
            await withdrawRate(rateId);
            notifications.show({ title: "Rate Withdrawn", message: `${corridor} rate withdrawn successfully`, color: "blue" });
            const freshRates = await getFXPRates();
            setRates(freshRates);
        } catch (err) {
            notifications.show({ title: "Error", message: err instanceof Error ? err.message : "Failed to withdraw rate", color: "red" });
        }
    };

    if (loading) {
        return (
            <Stack align="center" justify="center" h={400}>
                <Loader size="lg" />
                <Text c="dimmed">Loading FXP data...</Text>
            </Stack>
        );
    }

    if (error) {
        return (
            <Alert color="red" title="Error loading FXP data">
                {error}
            </Alert>
        );
    }

    return (
        <Stack gap="md">
            <Breadcrumbs mb="xs">
                <Anchor href="/actors" size="xs">Actor Registry</Anchor>
                <Text size="xs" c="dimmed">FX Rate Management</Text>
            </Breadcrumbs>
            <Group justify="space-between">
                <Title order={2}>FX Provider (FXP) Dashboard</Title>
                <Group>
                    <Anchor href="/sap" size="sm">View Liquidity (SAP)</Anchor>
                    <Badge color="blue" variant="light" leftSection={<IconArrowsExchange size={14} />}>
                        FXP View
                    </Badge>
                </Group>
            </Group>

            {/* FXP Role Explanation Banner */}
            <Alert icon={<IconInfoCircle size={18} />} title="What is a Foreign Exchange Provider (FXP)?" color="blue" variant="light">
                <Text size="sm">
                    FXPs provide competitive FX rates for cross-border payments in Nexus. They submit rates to Nexus,
                    which are then offered to PSPs when requesting quotes. FXPs can offer tiered pricing based on
                    transaction amounts and PSP relationships.
                </Text>
                <Anchor href="https://docs.nexusglobalpayments.org/fx-provision/role-of-the-fx-provider" size="xs" mt="xs">
                    Learn more in Nexus Documentation →
                </Anchor>
            </Alert>

            {/* Live Metrics Summary */}
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Active Rates</Text>
                        <IconArrowsExchange size={20} color="var(--mantine-color-blue-6)" />
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{rates.length}</Text>
                    <Text size="xs" c="dimmed">Quoted to Nexus</Text>
                </Card>
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Corridors</Text>
                        <Badge size="sm" color="green" variant="light">Live</Badge>
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{new Set(rates.map(r => `${r.sourceCurrency}-${r.destinationCurrency}`)).size}</Text>
                    <Text size="xs" c="dimmed">Unique pairs</Text>
                </Card>
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Avg Spread</Text>
                        <Badge size="sm" color="orange" variant="light">bps</Badge>
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{rates.length > 0 ? (rates.reduce((sum, r) => sum + r.spreadBps, 0) / rates.length).toFixed(1) : 0}</Text>
                    <Text size="xs" c="dimmed">Basis points</Text>
                </Card>
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Trades</Text>
                        <Badge size="sm" color="violet" variant="light">History</Badge>
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{trades.length}</Text>
                    <Text size="xs" c="dimmed">Executed</Text>
                </Card>
            </SimpleGrid>


            <Tabs defaultValue="active">
                <Tabs.List>
                    <Tabs.Tab value="active" leftSection={<IconArrowsExchange size={14} />}>Active Rates</Tabs.Tab>
                    <Tabs.Tab value="submit" leftSection={<IconPlus size={14} />}>Submit Rate</Tabs.Tab>
                    <Tabs.Tab value="trades" leftSection={<IconHistory size={14} />}>Trade History</Tabs.Tab>
                    <Tabs.Tab value="psp" leftSection={<IconUsers size={14} />}>PSP Relationships</Tabs.Tab>
                    <Tabs.Tab value="tiers">Tier Management</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="active" pt="md">
                    <Card>
                        <Group justify="space-between" mb="md">
                            <Title order={5}>Active FX Rates</Title>
                            <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={loadData}>
                                Refresh
                            </Button>
                        </Group>
                        <Table.ScrollContainer minWidth={750}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Corridor</Table.Th>
                                        <Table.Th>Base Rate</Table.Th>
                                        <Table.Th>Spread (bps)</Table.Th>
                                        <Table.Th>Effective</Table.Th>
                                        <Table.Th>Expires</Table.Th>
                                        <Table.Th>Status</Table.Th>
                                        <Table.Th>Actions</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {rates.map((rate) => (
                                        <Table.Tr key={rate.rateId}>
                                            <Table.Td><Text fw={500}>{rate.sourceCurrency} → {rate.destinationCurrency}</Text></Table.Td>
                                            <Table.Td>{parseFloat(rate.rate).toFixed(4)}</Table.Td>
                                            <Table.Td>{rate.spreadBps}</Table.Td>
                                            <Table.Td fw={600}>{parseFloat(rate.effectiveRate).toFixed(4)}</Table.Td>
                                            <Table.Td>
                                                <Group gap="xs">
                                                    <IconClock size={14} />
                                                    {rate.validUntil ? <CountdownText targetDate={rate.validUntil} /> : "—"}
                                                </Group>
                                            </Table.Td>
                                            <Table.Td><Badge color="green" size="sm">{rate.status}</Badge></Table.Td>
                                            <Table.Td>
                                                <Button size="xs" variant="light" color="red" onClick={() => handleWithdrawRate(rate.rateId, `${rate.sourceCurrency} → ${rate.destinationCurrency}`)}>
                                                    Withdraw
                                                </Button>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {rates.length === 0 && (
                                        <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center" py="md">No active rates</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="submit" pt="md">
                    <SimpleGrid cols={{ base: 1, md: 2 }}>
                        <Card>
                            <Stack gap="md">
                                <Title order={5}>Submit New Rate</Title>
                                <SimpleGrid cols={2}>
                                    <Select
                                        label="Source Currency"
                                        description="Currency you are selling"
                                        data={CURRENCIES}
                                        value={newRate.sourceCurrency}
                                        onChange={(v) => setNewRate({ ...newRate, sourceCurrency: v || "SGD" })}
                                        searchable
                                    />
                                    <Select
                                        label="Destination Currency"
                                        description="Currency you are buying"
                                        data={CURRENCIES}
                                        value={newRate.destinationCurrency}
                                        onChange={(v) => setNewRate({ ...newRate, destinationCurrency: v || "MYR" })}
                                        searchable
                                    />
                                </SimpleGrid>
                                {newRate.sourceCurrency === newRate.destinationCurrency && (
                                    <Alert color="red" variant="light">Source and destination must be different</Alert>
                                )}
                                <NumberInput
                                    label={`Exchange Rate (1 ${newRate.sourceCurrency} = ? ${newRate.destinationCurrency})`}
                                    description="How many destination units per 1 source unit"
                                    value={newRate.rate}
                                    onChange={(v) => setNewRate({ ...newRate, rate: Number(v) })}
                                    decimalScale={4}
                                    min={0}
                                />
                                <NumberInput
                                    label="Spread (basis points)"
                                    description="Your margin on top of mid-market rate"
                                    value={newRate.spread}
                                    onChange={(v) => setNewRate({ ...newRate, spread: Number(v) })}
                                    min={0}
                                    max={100}
                                />
                                <Button
                                    leftSection={<IconPlus size={16} />}
                                    onClick={handleSubmitRate}
                                    disabled={newRate.sourceCurrency === newRate.destinationCurrency}
                                >
                                    Submit Rate
                                </Button>
                            </Stack>
                        </Card>

                        <Card>
                            <Title order={5} mb="md">Rate Preview</Title>
                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text c="dimmed">Direction</Text>
                                    <Text fw={500}>{newRate.sourceCurrency} → {newRate.destinationCurrency}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text c="dimmed">Rate Quote</Text>
                                    <Text fw={600} size="lg" c="blue">
                                        1 {newRate.sourceCurrency} = {newRate.rate.toFixed(4)} {newRate.destinationCurrency}
                                    </Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text c="dimmed">Spread</Text>
                                    <Text fw={500}>{newRate.spread} bps</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text c="dimmed">Effective Rate (after spread)</Text>
                                    <Text fw={500}>
                                        {(newRate.rate * (1 - newRate.spread / 10000)).toFixed(4)} {newRate.destinationCurrency}
                                    </Text>
                                </Group>
                            </Stack>
                        </Card>
                    </SimpleGrid>
                </Tabs.Panel>

                <Tabs.Panel value="trades" pt="md">
                    <Card>
                        <Title order={5} mb="md">Trade Execution History</Title>
                        <Table.ScrollContainer minWidth={600}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Corridor</Table.Th>
                                        <Table.Th>Amount</Table.Th>
                                        <Table.Th>Rate</Table.Th>
                                        <Table.Th>UETR</Table.Th>
                                        <Table.Th>Timestamp</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {trades.map((trade) => (
                                        <Table.Tr key={trade.tradeId}>
                                            <Table.Td fw={500}>{trade.sourceCurrency} → {trade.destinationCurrency}</Table.Td>
                                            <Table.Td>{parseFloat(trade.amount).toFixed(4)}</Table.Td>
                                            <Table.Td>{parseFloat(trade.rate).toFixed(4)}</Table.Td>
                                            <Table.Td><Text size="xs" ff="monospace">{trade.uetr?.substring(0, 12)}...</Text></Table.Td>
                                            <Table.Td><Text size="xs">{new Date(trade.timestamp).toLocaleString()}</Text></Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {trades.length === 0 && (
                                        <Table.Tr><Table.Td colSpan={5}><Text c="dimmed" ta="center" py="md">No trades yet</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="psp" pt="md">
                    <Card>
                        <Title order={5} mb="md">PSP Relationship Tiers</Title>
                        <Text c="dimmed" size="sm" mb="md">
                            Rate improvements for specific PSP partnerships, loaded from backend.
                        </Text>
                        <Table.ScrollContainer minWidth={500}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>PSP</Table.Th>
                                        <Table.Th>BIC</Table.Th>
                                        <Table.Th>Tier</Table.Th>
                                        <Table.Th>Improvement</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {pspRelationships.map((rel) => (
                                        <Table.Tr key={rel.pspBic}>
                                            <Table.Td fw={500}>{rel.pspName}</Table.Td>
                                            <Table.Td><Text size="xs" ff="monospace">{rel.pspBic}</Text></Table.Td>
                                            <Table.Td>
                                                <Badge color={rel.tier === "PREMIUM" ? "blue" : rel.tier === "VOLUME" ? "violet" : "gray"}>
                                                    {rel.tier}
                                                </Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text c={rel.improvementBps > 0 ? "green" : "dimmed"} fw={500}>
                                                    +{rel.improvementBps} bps
                                                </Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {pspRelationships.length === 0 && (
                                        <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center" py="md">No PSP relationships configured</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel value="tiers" pt="md">
                    <Card>
                        <Title order={5} mb="md">Transaction Amount Tiers</Title>
                        <Text c="dimmed" size="sm" mb="md">
                            Configure rate improvements based on transaction volume. Higher amounts get better rates.
                        </Text>
                        <Table.ScrollContainer minWidth={500}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Amount Range</Table.Th>
                                        <Table.Th>Tier</Table.Th>
                                        <Table.Th>Improvement</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {amountTiers.map((tier) => (
                                        <Table.Tr key={tier.tierId}>
                                            <Table.Td>
                                                <Text size="sm">
                                                    {tier.minAmount.toLocaleString()} - {tier.maxAmount ? tier.maxAmount.toLocaleString() : "∞"}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge color={tier.improvementBps > 0 ? "green" : "gray"}>
                                                    {tier.label}
                                                </Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text c={tier.improvementBps > 0 ? "green" : "dimmed"} fw={500}>
                                                    +{tier.improvementBps} bps
                                                </Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                        <Group mt="md">
                            <NumberInput label="Min Amount" size="xs" value={newTier.minAmount} onChange={(v) => setNewTier({ ...newTier, minAmount: Number(v) })} style={{ flex: 1 }} />
                            <NumberInput label="Max Amount" size="xs" value={newTier.maxAmount} onChange={(v) => setNewTier({ ...newTier, maxAmount: Number(v) })} style={{ flex: 1 }} />
                            <NumberInput label="Improvement (bps)" size="xs" value={newTier.improvementBps} onChange={(v) => setNewTier({ ...newTier, improvementBps: Number(v) })} style={{ flex: 1 }} />
                            <Button
                                size="xs"
                                mt="md"
                                onClick={() => {
                                    setAmountTiers([...amountTiers, {
                                        tierId: `T-${Date.now()}`,
                                        minAmount: newTier.minAmount,
                                        maxAmount: newTier.maxAmount,
                                        improvementBps: newTier.improvementBps,
                                        label: newTier.improvementBps >= 10 ? "Premium" : newTier.improvementBps > 0 ? "Volume" : "Custom"
                                    }]);
                                    notifications.show({ title: "Tier Added", message: "Amount tier created", color: "green" });
                                }}
                            >
                                Add Tier
                            </Button>
                        </Group>
                    </Card>
                </Tabs.Panel>
            </Tabs>

            {/* Developer Debug Panel for FXP Actor */}
            <DevDebugPanel context={{ actorType: "FXP", actorName: "FX Provider" }} showToggle={true} />
        </Stack>
    );
}
