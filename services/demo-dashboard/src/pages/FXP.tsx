import { useState } from "react";
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
    ActionIcon,
    Tooltip,
    Anchor,
    Breadcrumbs,
    Alert,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconArrowsExchange,
    IconPlus,
    IconRefresh,
    IconTrash,
    IconClock,
    IconInfoCircle,
} from "@tabler/icons-react";
import { useEffect } from "react";
import { DevDebugPanel } from "../components/DevDebugPanel";

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


// Demo FX rates data
const DEMO_RATES = [
    { rateId: "R-001", sourceCurrency: "SGD", destinationCurrency: "THB", rate: 26.4521, spreadBps: 25, fxpName: "GlobalFX", validUntil: new Date(Date.now() + 60000).toISOString(), status: "ACTIVE" as const },
    { rateId: "R-002", sourceCurrency: "SGD", destinationCurrency: "MYR", rate: 3.4123, spreadBps: 30, fxpName: "GlobalFX", validUntil: new Date(Date.now() + 45000).toISOString(), status: "ACTIVE" as const },
    { rateId: "R-003", sourceCurrency: "SGD", destinationCurrency: "PHP", rate: 42.1234, spreadBps: 35, fxpName: "GlobalFX", validUntil: new Date(Date.now() + 30000).toISOString(), status: "ACTIVE" as const },
];

const CURRENCIES = [
    { value: "SGD", label: "🇸🇬 SGD - Singapore Dollar" },
    { value: "THB", label: "🇹🇭 THB - Thai Baht" },
    { value: "MYR", label: "🇲🇾 MYR - Malaysian Ringgit" },
    { value: "PHP", label: "🇵🇭 PHP - Philippine Peso" },
    { value: "IDR", label: "🇮🇩 IDR - Indonesian Rupiah" },
    { value: "INR", label: "🇮🇳 INR - Indian Rupee" },
];

// Demo amount tier data - Per Nexus Spec:
// Improvements are POSITIVE values that ADD to the rate (better for customer)
// Reference: https://docs.nexusglobalpayments.org/fx-provision/rates-from-third-party-fx-providers/improving-rates-for-larger-transactions
const DEMO_AMOUNT_TIERS = [
    { tierId: "T-001", minAmount: 0, maxAmount: 1000, improvementBps: 0, label: "Standard" },
    { tierId: "T-002", minAmount: 1000, maxAmount: 10000, improvementBps: 5, label: "Volume" },
    { tierId: "T-003", minAmount: 10000, maxAmount: null, improvementBps: 10, label: "Premium" },
];

export function FXPPage() {
    const [rates, setRates] = useState(DEMO_RATES);
    const [amountTiers, setAmountTiers] = useState(DEMO_AMOUNT_TIERS);
    const [newRate, setNewRate] = useState({
        sourceCurrency: "SGD",
        destinationCurrency: "MYR",
        rate: 3.41,
        spread: 25
    });
    const [newTier, setNewTier] = useState({ minAmount: 0, maxAmount: 1000, improvementBps: 0 });

    const handleSubmitRate = () => {
        if (newRate.sourceCurrency === newRate.destinationCurrency) {
            notifications.show({ title: "Invalid Corridor", message: "Source and destination currencies must be different", color: "red" });
            return;
        }
        setRates([
            ...rates,
            {
                rateId: `R-${Date.now()}`,
                sourceCurrency: newRate.sourceCurrency,
                destinationCurrency: newRate.destinationCurrency,
                rate: newRate.rate,
                spreadBps: newRate.spread,
                fxpName: "Demo FXP",
                validUntil: new Date(Date.now() + 60000).toISOString(),
                status: "ACTIVE",
            },
        ]);
        notifications.show({ title: "Rate Submitted", message: `${newRate.sourceCurrency} → ${newRate.destinationCurrency} @ ${newRate.rate}`, color: "green" });
    };

    const handleWithdraw = (rateId: string) => {
        setRates(rates.filter((r) => r.rateId !== rateId));
        notifications.show({ title: "Rate Withdrawn", message: `Removed ${rateId}`, color: "yellow" });
    };

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
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Volume Tiers</Text>
                        <Badge size="sm" color="violet" variant="light">Config</Badge>
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{amountTiers.length}</Text>
                    <Text size="xs" c="dimmed">Improvement tiers</Text>
                </Card>
            </SimpleGrid>


            <Tabs defaultValue="active">
                <Tabs.List>
                    <Tabs.Tab value="active">Active Rates</Tabs.Tab>
                    <Tabs.Tab value="submit">Submit Rate</Tabs.Tab>
                    <Tabs.Tab value="tiers">Tier Management</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="active" pt="md">
                    <Card>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Corridor</Table.Th>
                                    <Table.Th>Rate</Table.Th>
                                    <Table.Th>Spread (bps)</Table.Th>
                                    <Table.Th>Expires</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Actions</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {rates.map((rate) => (
                                    <Table.Tr key={rate.rateId}>
                                        <Table.Td>
                                            <Text fw={500}>{rate.sourceCurrency} → {rate.destinationCurrency}</Text>
                                        </Table.Td>
                                        <Table.Td>{rate.rate.toFixed(4)}</Table.Td>
                                        <Table.Td>{rate.spreadBps}</Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <IconClock size={14} />
                                                <CountdownText targetDate={rate.validUntil} />
                                            </Group>
                                        </Table.Td>

                                        <Table.Td>
                                            <Badge color="green" size="sm">{rate.status}</Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Tooltip label="Refresh">
                                                    <ActionIcon variant="subtle" color="blue">
                                                        <IconRefresh size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label="Withdraw">
                                                    <ActionIcon variant="subtle" color="red" onClick={() => handleWithdraw(rate.rateId)}>
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
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
                                <Group justify="space-between">
                                    <Text c="dimmed">Valid for</Text>
                                    <Text fw={500}>600 seconds (10 min)</Text>
                                </Group>
                            </Stack>
                        </Card>
                    </SimpleGrid>
                </Tabs.Panel>

                <Tabs.Panel value="tiers" pt="md">
                    <SimpleGrid cols={{ base: 1, md: 2 }}>
                        {/* Transaction Amount Tiers */}
                        <Card>
                            <Title order={5} mb="md">Transaction Amount Tiers</Title>
                            <Text c="dimmed" size="sm" mb="md">
                                Configure rate improvements based on transaction volume. Higher amounts get better rates.
                            </Text>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Amount Range</Table.Th>
                                        <Table.Th>Tier</Table.Th>
                                        <Table.Th>Improvement</Table.Th>
                                        <Table.Th>Actions</Table.Th>
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
                                            <Table.Td>
                                                <Button size="xs" variant="subtle">Edit</Button>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                            <Group mt="md">
                                <NumberInput
                                    label="Min Amount"
                                    size="xs"
                                    value={newTier.minAmount}
                                    onChange={(v) => setNewTier({ ...newTier, minAmount: Number(v) })}
                                    style={{ flex: 1 }}
                                />
                                <NumberInput
                                    label="Max Amount"
                                    size="xs"
                                    value={newTier.maxAmount}
                                    onChange={(v) => setNewTier({ ...newTier, maxAmount: Number(v) })}
                                    style={{ flex: 1 }}
                                />
                                <NumberInput
                                    label="Improvement (bps)"
                                    size="xs"
                                    value={newTier.improvementBps}
                                    onChange={(v) => setNewTier({ ...newTier, improvementBps: Number(v) })}
                                    style={{ flex: 1 }}
                                />
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

                        {/* PSP Relationship Tiers */}
                        <Card>
                            <Title order={5} mb="md">PSP Relationship Tiers</Title>
                            <Text c="dimmed" size="sm" mb="md">
                                Configure rate improvements for specific PSP partnerships.
                            </Text>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>PSP</Table.Th>
                                        <Table.Th>Tier</Table.Th>
                                        <Table.Th>Improvement</Table.Th>
                                        <Table.Th>Actions</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td>Demo Bank SG</Table.Td>
                                        <Table.Td><Badge>PREMIUM</Badge></Table.Td>
                                        <Table.Td><Text c="green" fw={500}>+5 bps</Text></Table.Td>
                                        <Table.Td>
                                            <Button size="xs" variant="subtle">Edit</Button>
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td>Partner Bank TH</Table.Td>
                                        <Table.Td><Badge color="gray">STANDARD</Badge></Table.Td>
                                        <Table.Td><Text c="dimmed">0 bps</Text></Table.Td>
                                        <Table.Td>
                                            <Button size="xs" variant="subtle">Edit</Button>
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td>MYR Bank MY</Table.Td>
                                        <Table.Td><Badge color="blue">VOLUME</Badge></Table.Td>
                                        <Table.Td><Text c="green" fw={500}>+3 bps</Text></Table.Td>
                                        <Table.Td>
                                            <Button size="xs" variant="subtle">Edit</Button>
                                        </Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>
                    </SimpleGrid>
                </Tabs.Panel>
            </Tabs>

            {/* Developer Debug Panel for FXP Actor */}
            <DevDebugPanel context={{ actorType: "FXP", actorName: "FX Provider" }} showToggle={true} />
        </Stack>
    );
}
