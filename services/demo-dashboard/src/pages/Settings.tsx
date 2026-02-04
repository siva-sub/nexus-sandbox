import {
    Title,
    Card,
    Stack,
    Group,
    Text,
    Badge,
    Switch,
    TextInput,
    Select,
    Button,
    Divider,
    Code,
    SimpleGrid,
    Checkbox,
    NumberInput,
    Alert,
} from "@mantine/core";
import { useState, useEffect } from "react";
import {
    IconSettings,
    IconServer,
    IconPalette,
    IconBell,
    IconTrash,
    IconRefresh,
    IconCheck,
    IconAlertTriangle,
    IconDatabase,
    IconReceipt,
    IconArrowsExchange,
    IconCalendar,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { getDemoDataStats, purgeDemoData } from "../services/api";
import type { DemoDataStats, PurgeResult } from "../services/api";

export function SettingsPage() {
    const [apiUrl, setApiUrl] = useState("/api");
    const [mockMode, setMockMode] = useState(false);
    const [animationsEnabled, setAnimationsEnabled] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);

    // Demo data management
    const [stats, setStats] = useState<DemoDataStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [purgeLoading, setPurgeLoading] = useState(false);
    const [lastPurge, setLastPurge] = useState<PurgeResult | null>(null);
    const [ageHours, setAgeHours] = useState<number>(0);
    const [includeQuotes, setIncludeQuotes] = useState(true);

    const loadStats = async () => {
        setStatsLoading(true);
        try {
            const data = await getDemoDataStats();
            setStats(data);
        } catch (err) {
            notifications.show({
                title: "Error",
                message: err instanceof Error ? err.message : "Failed to load stats",
                color: "red",
            });
        } finally {
            setStatsLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    const handleDryRun = async () => {
        setPurgeLoading(true);
        try {
            const result = await purgeDemoData({ ageHours, includeQuotes, dryRun: true });
            setLastPurge(result);
            notifications.show({
                title: "Dry Run Complete",
                message: `Would delete ${result.wouldDelete?.payments || 0} payments`,
                color: "blue",
            });
        } catch (err) {
            notifications.show({
                title: "Error",
                message: err instanceof Error ? err.message : "Dry run failed",
                color: "red",
            });
        } finally {
            setPurgeLoading(false);
        }
    };

    const handlePurge = async () => {
        setPurgeLoading(true);
        try {
            const result = await purgeDemoData({ ageHours, includeQuotes, dryRun: false });
            setLastPurge(result);
            notifications.show({
                title: "Purge Complete",
                message: `Deleted ${result.deleted?.payments || 0} payments`,
                color: "green",
                icon: <IconCheck size={16} />,
            });
            await loadStats();
        } catch (err) {
            notifications.show({
                title: "Error",
                message: err instanceof Error ? err.message : "Purge failed",
                color: "red",
            });
        } finally {
            setPurgeLoading(false);
        }
    };

    const handleSave = () => {
        notifications.show({
            title: "Settings Saved",
            message: "Your preferences have been updated",
            color: "green",
        });
    };

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Title order={2}>Settings</Title>
                <Badge color="gray" variant="light" leftSection={<IconSettings size={14} />}>
                    Configuration
                </Badge>
            </Group>

            {/* Demo Data Statistics */}
            <Card>
                <Group mb="md" justify="space-between">
                    <Group>
                        <IconDatabase size={20} />
                        <Title order={5}>Demo Data Statistics</Title>
                    </Group>
                    <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconRefresh size={14} />}
                        onClick={loadStats}
                        loading={statsLoading}
                    >
                        Refresh
                    </Button>
                </Group>

                {stats && (
                    <>
                        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="md">
                            <Card withBorder p="sm">
                                <Group gap="xs">
                                    <IconDatabase size={16} color="var(--mantine-color-blue-6)" />
                                    <Text size="xs" c="dimmed">Payments</Text>
                                </Group>
                                <Text size="lg" fw={700}>{stats.totalPayments}</Text>
                            </Card>
                            <Card withBorder p="sm">
                                <Group gap="xs">
                                    <IconArrowsExchange size={16} color="var(--mantine-color-green-6)" />
                                    <Text size="xs" c="dimmed">Quotes</Text>
                                </Group>
                                <Text size="lg" fw={700}>{stats.totalQuotes}</Text>
                            </Card>
                            <Card withBorder p="sm">
                                <Group gap="xs">
                                    <IconReceipt size={16} color="var(--mantine-color-orange-6)" />
                                    <Text size="xs" c="dimmed">Events</Text>
                                </Group>
                                <Text size="lg" fw={700}>{stats.totalEvents}</Text>
                            </Card>
                            <Card withBorder p="sm">
                                <Group gap="xs">
                                    <IconCalendar size={16} color="var(--mantine-color-grape-6)" />
                                    <Text size="xs" c="dimmed">Last Payment</Text>
                                </Group>
                                <Text size="xs" fw={500}>
                                    {stats.newestPayment
                                        ? new Date(stats.newestPayment).toLocaleString()
                                        : "None"}
                                </Text>
                            </Card>
                        </SimpleGrid>

                        {Object.keys(stats.paymentsByStatus).length > 0 && (
                            <Group gap="xs">
                                <Text size="xs" c="dimmed">By Status:</Text>
                                {Object.entries(stats.paymentsByStatus).map(([status, count]) => (
                                    <Badge
                                        key={status}
                                        color={status === "ACCC" ? "green" : status === "PDNG" ? "yellow" : "red"}
                                        variant="light"
                                        size="sm"
                                    >
                                        {status}: {count}
                                    </Badge>
                                ))}
                            </Group>
                        )}
                    </>
                )}
            </Card>

            {/* Purge Demo Data */}
            <Card>
                <Group mb="md">
                    <IconTrash size={20} />
                    <Title order={5}>Purge Demo Data</Title>
                </Group>

                <Alert
                    color="orange"
                    icon={<IconAlertTriangle size={16} />}
                    mb="md"
                    title="Warning"
                >
                    This action cannot be undone. Use dry run first to preview.
                </Alert>

                <Stack gap="md">
                    <Group grow>
                        <NumberInput
                            label="Age Threshold (hours)"
                            description="0 = delete all data"
                            value={ageHours}
                            onChange={(val) => setAgeHours(Number(val) || 0)}
                            min={0}
                            max={720}
                        />
                    </Group>

                    <Checkbox
                        label="Include quotes"
                        description="Also delete quote snapshots"
                        checked={includeQuotes}
                        onChange={(e) => setIncludeQuotes(e.currentTarget.checked)}
                    />

                    <Group>
                        <Button
                            variant="light"
                            color="blue"
                            onClick={handleDryRun}
                            loading={purgeLoading}
                        >
                            Dry Run (Preview)
                        </Button>
                        <Button
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={handlePurge}
                            loading={purgeLoading}
                        >
                            Purge Data
                        </Button>
                    </Group>

                    {lastPurge && (
                        <Card withBorder p="sm" bg="gray.0">
                            <Text size="xs" fw={500} mb="xs">
                                {lastPurge.dryRun ? "Dry Run Result:" : "Purge Result:"}
                            </Text>
                            <Code block style={{ fontSize: "0.7rem" }}>{JSON.stringify(lastPurge, null, 2)}</Code>
                        </Card>
                    )}
                </Stack>
            </Card>

            <Divider />

            {/* API Configuration */}
            <Card>
                <Group mb="md">
                    <IconServer size={20} />
                    <Title order={5}>API Configuration</Title>
                </Group>
                <Stack gap="md">
                    <TextInput
                        label="API Base URL"
                        description="Backend gateway URL for API requests"
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                        placeholder="/api or http://localhost:8000"
                    />
                    <Switch
                        label="Mock Mode (GitHub Pages)"
                        description="Use simulated data instead of real API calls"
                        checked={mockMode}
                        onChange={(e) => setMockMode(e.currentTarget.checked)}
                    />
                    <Text size="xs" c="dimmed">
                        Current environment: <Code>{import.meta.env.MODE}</Code>
                    </Text>
                </Stack>
            </Card>

            {/* Display Settings */}
            <Card>
                <Group mb="md">
                    <IconPalette size={20} />
                    <Title order={5}>Display Preferences</Title>
                </Group>
                <Stack gap="md">
                    <Switch
                        label="Enable Animations"
                        description="Animate lifecycle steps and transitions"
                        checked={animationsEnabled}
                        onChange={(e) => setAnimationsEnabled(e.currentTarget.checked)}
                    />
                    <Select
                        label="Default Actor View"
                        description="Which dashboard to show on startup"
                        data={[
                            { value: "psp", label: "PSP (Payment)" },
                            { value: "fxp", label: "FXP (Rates)" },
                            { value: "sap", label: "SAP (Liquidity)" },
                        ]}
                        defaultValue="psp"
                    />
                </Stack>
            </Card>

            {/* Notifications */}
            <Card>
                <Group mb="md">
                    <IconBell size={20} />
                    <Title order={5}>Notifications</Title>
                </Group>
                <Stack gap="md">
                    <Switch
                        label="Enable Toast Notifications"
                        description="Show status updates during payment flow"
                        checked={notificationsEnabled}
                        onChange={(e) => setNotificationsEnabled(e.currentTarget.checked)}
                    />
                </Stack>
            </Card>

            <Divider />

            <Group justify="flex-end">
                <Button variant="subtle">Reset to Defaults</Button>
                <Button onClick={handleSave}>Save Settings</Button>
            </Group>

            {/* System Info */}
            <Card>
                <Title order={6} mb="sm">System Information</Title>
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Dashboard Version</Text>
                        <Code>2.0.0</Code>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">API Documentation</Text>
                        <Group gap="xs">
                            <Button component="a" href="/api/docs" target="_blank" variant="subtle" size="xs">
                                Swagger
                            </Button>
                            <Button component="a" href="/api/redoc" target="_blank" variant="subtle" size="xs">
                                ReDoc
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Card>
        </Stack>
    );
}

