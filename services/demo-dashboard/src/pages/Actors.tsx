import { useState, useEffect, useCallback } from "react";
import {
    Container,
    Title,
    Text,
    Paper,
    Table,
    Badge,
    Button,
    Group,
    Stack,
    TextInput,
    Select,
    Modal,
    ActionIcon,
    Tooltip,
    Loader,
    Alert,
    CopyButton,
    Code,
    Card,
    SimpleGrid,
    ThemeIcon,
} from "@mantine/core";
import {
    IconPlus,
    IconRefresh,
    IconTrash,
    IconCheck,
    IconCopy,
    IconAlertCircle,
    IconBuilding,
    IconWorld,
    IconLink,
    IconArrowsExchange,
    IconCoin,
    IconSend,
    IconNetwork,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";


const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// Types
interface Actor {
    actorId: string;
    bic: string;
    actorType: "FXP" | "IPS" | "PSP" | "SAP" | "PDO";
    name: string;
    countryCode: string;
    callbackUrl: string | null;
    registeredAt: string;
    status: string;
}

const ACTOR_TYPE_COLORS: Record<string, string> = {
    FXP: "violet",
    IPS: "blue",
    PSP: "green",
    SAP: "orange",
    PDO: "pink",
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
    FXP: "FX Provider",
    IPS: "IPS Operator",
    PSP: "Payment Service Provider",
    SAP: "Settlement Access Provider",
    PDO: "Proxy Directory Operator",
};

export function ActorsPage() {
    const [actors, setActors] = useState<Actor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string | null>(null);
    const [filterCountry, setFilterCountry] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    // Form state for new actor
    const [newActor, setNewActor] = useState<{
        bic: string,
        actorType: Actor["actorType"],
        name: string,
        countryCode: string,
        callbackUrl: string,
    }>({
        bic: "",
        actorType: "PSP",
        name: "",
        countryCode: "",
        callbackUrl: "",
    });

    const fetchActors = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let url = `${API_BASE}/v1/actors`;
            const params = new URLSearchParams();
            if (filterType) params.append("actor_type", filterType);
            if (filterCountry) params.append("country_code", filterCountry);
            if (params.toString()) url += `?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch actors");
            const data = await response.json();
            setActors(data.actors || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setLoading(false);
        }
    }, [filterType, filterCountry]);

    useEffect(() => {
        fetchActors();
    }, [fetchActors]);

    const handleRegister = async () => {
        try {
            const response = await fetch(`${API_BASE}/v1/actors/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bic: newActor.bic.toUpperCase(),
                    actorType: newActor.actorType,
                    name: newActor.name,
                    countryCode: newActor.countryCode.toUpperCase(),
                    callbackUrl: newActor.callbackUrl || null,
                }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Registration failed");
            }

            notifications.show({
                title: "Success",
                message: `Actor ${newActor.bic} registered successfully`,
                color: "green",
            });

            setModalOpen(false);
            setNewActor({ bic: "", actorType: "PSP", name: "", countryCode: "", callbackUrl: "" });
            fetchActors();
        } catch (err) {
            notifications.show({
                title: "Error",
                message: err instanceof Error ? err.message : "Registration failed",
                color: "red",
            });
        }
    };

    const handleDelete = async (bic: string) => {
        try {
            const response = await fetch(`${API_BASE}/v1/actors/${bic}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Delete failed");

            notifications.show({
                title: "Removed",
                message: `Actor ${bic} deregistered`,
                color: "orange",
            });

            fetchActors();
        } catch (err) {
            notifications.show({
                title: "Error",
                message: err instanceof Error ? err.message : "Delete failed",
                color: "red",
            });
        }
    };

    const rows = actors.map((actor) => (
        <Table.Tr key={actor.bic}>
            <Table.Td>
                <Group gap="xs">
                    <CopyButton value={actor.bic}>
                        {({ copied, copy }) => (
                            <Tooltip label={copied ? "Copied" : "Copy BIC"}>
                                <ActionIcon variant="subtle" size="sm" onClick={copy}>
                                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                    <Code>{actor.bic}</Code>
                </Group>
            </Table.Td>
            <Table.Td>
                <Badge color={ACTOR_TYPE_COLORS[actor.actorType]} variant="light">
                    {actor.actorType}
                </Badge>
            </Table.Td>
            <Table.Td>{actor.name}</Table.Td>
            <Table.Td>
                <Badge variant="outline">{actor.countryCode}</Badge>
            </Table.Td>
            <Table.Td>
                {actor.callbackUrl ? (
                    <Tooltip label={actor.callbackUrl}>
                        <Badge leftSection={<IconLink size={12} />} color="cyan" variant="light">
                            Configured
                        </Badge>
                    </Tooltip>
                ) : (
                    <Text size="xs" c="dimmed">Not set</Text>
                )}
            </Table.Td>
            <Table.Td>
                <Badge color={actor.status === "ACTIVE" ? "green" : "gray"}>
                    {actor.status}
                </Badge>
            </Table.Td>
            <Table.Td>
                <Group gap="xs">
                    <Tooltip label="Delete">
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDelete(actor.bic)}
                        >
                            <IconTrash size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <Container size="xl" py="xl">
            <Stack gap="lg">
                {/* Header */}
                <Group justify="space-between">
                    <div>
                        <Title order={2}>Actor Registry</Title>
                        <Text c="dimmed">
                            Manage sandbox participants (FXP, IPS, PSP, SAP, PDO)
                        </Text>
                    </div>
                    <Group>
                        <Button
                            leftSection={<IconRefresh size={16} />}
                            variant="light"
                            onClick={fetchActors}
                            loading={loading}
                        >
                            Refresh
                        </Button>
                        <Button
                            leftSection={<IconPlus size={16} />}
                            onClick={() => setModalOpen(true)}
                        >
                            Register Actor
                        </Button>
                    </Group>
                </Group>

                {/* Filters */}
                <Paper p="md" withBorder>
                    <Group>
                        <Select
                            placeholder="Filter by type"
                            clearable
                            data={[
                                { value: "FXP", label: "FX Provider" },
                                { value: "IPS", label: "IPS Operator" },
                                { value: "PSP", label: "PSP" },
                                { value: "SAP", label: "SAP" },
                                { value: "PDO", label: "PDO" },
                            ]}
                            value={filterType}
                            onChange={setFilterType}
                            leftSection={<IconBuilding size={16} />}
                            w={200}
                        />
                        <Select
                            placeholder="Filter by country"
                            clearable
                            data={[
                                { value: "SG", label: "Singapore" },
                                { value: "TH", label: "Thailand" },
                                { value: "MY", label: "Malaysia" },
                                { value: "PH", label: "Philippines" },
                                { value: "ID", label: "Indonesia" },
                            ]}
                            value={filterCountry}
                            onChange={setFilterCountry}
                            leftSection={<IconWorld size={16} />}
                            w={200}
                        />
                    </Group>
                </Paper>

                {/* Error State */}
                {error && (
                    <Alert color="red" icon={<IconAlertCircle />}>
                        {error}
                    </Alert>
                )}

                {/* Table */}
                <Paper withBorder>
                    {loading ? (
                        <Group justify="center" p="xl">
                            <Loader />
                        </Group>
                    ) : (
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>BIC</Table.Th>
                                    <Table.Th>Type</Table.Th>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th>Country</Table.Th>
                                    <Table.Th>Callback URL</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Actions</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {rows.length > 0 ? rows : (
                                    <Table.Tr>
                                        <Table.Td colSpan={7}>
                                            <Text ta="center" c="dimmed" py="xl">
                                                No actors found
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    )}
                </Paper>

                {/* Quick Actions - Related Pages */}
                <Paper p="md" withBorder>
                    <Text size="sm" fw={500} mb="md">Quick Actions</Text>
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                        <Card
                            component={Link}
                            to="/fxp"
                            padding="md"
                            withBorder
                            style={{ cursor: "pointer" }}
                        >
                            <Group>
                                <ThemeIcon size="lg" variant="light" color="violet">
                                    <IconArrowsExchange size={20} />
                                </ThemeIcon>
                                <div>
                                    <Text size="sm" fw={500}>FX Rates</Text>
                                    <Text size="xs" c="dimmed">Manage FXP rates</Text>
                                </div>
                            </Group>
                        </Card>
                        <Card
                            component={Link}
                            to="/sap"
                            padding="md"
                            withBorder
                            style={{ cursor: "pointer" }}
                        >
                            <Group>
                                <ThemeIcon size="lg" variant="light" color="orange">
                                    <IconCoin size={20} />
                                </ThemeIcon>
                                <div>
                                    <Text size="sm" fw={500}>Liquidity</Text>
                                    <Text size="xs" c="dimmed">SAP balances</Text>
                                </div>
                            </Group>
                        </Card>
                        <Card
                            component={Link}
                            to="/payment"
                            padding="md"
                            withBorder
                            style={{ cursor: "pointer" }}
                        >
                            <Group>
                                <ThemeIcon size="lg" variant="light" color="green">
                                    <IconSend size={20} />
                                </ThemeIcon>
                                <div>
                                    <Text size="sm" fw={500}>Send Payment</Text>
                                    <Text size="xs" c="dimmed">PSP flow</Text>
                                </div>
                            </Group>
                        </Card>
                        <Card
                            component={Link}
                            to="/mesh"
                            padding="md"
                            withBorder
                            style={{ cursor: "pointer" }}
                        >
                            <Group>
                                <ThemeIcon size="lg" variant="light" color="blue">
                                    <IconNetwork size={20} />
                                </ThemeIcon>
                                <div>
                                    <Text size="sm" fw={500}>Network Mesh</Text>
                                    <Text size="xs" c="dimmed">View topology</Text>
                                </div>
                            </Group>
                        </Card>
                    </SimpleGrid>
                </Paper>

                {/* Actor Type Legend */}
                <Paper p="md" withBorder>
                    <Text size="sm" fw={500} mb="xs">Actor Types</Text>
                    <Group>
                        {Object.entries(ACTOR_TYPE_LABELS).map(([type, label]) => (
                            <Badge key={type} color={ACTOR_TYPE_COLORS[type]} variant="light">
                                {type}: {label}
                            </Badge>
                        ))}
                    </Group>
                </Paper>
            </Stack>

            {/* Registration Modal */}
            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Register New Actor"
                size="md"
            >
                <Stack gap="md">
                    <TextInput
                        label="BIC Code"
                        placeholder="e.g., YOURPSPXXX"
                        value={newActor.bic}
                        onChange={(e) => setNewActor({ ...newActor, bic: e.target.value })}
                        required
                    />
                    <Select
                        label="Actor Type"
                        data={[
                            { value: "FXP", label: "FX Provider" },
                            { value: "IPS", label: "IPS Operator" },
                            { value: "PSP", label: "Payment Service Provider" },
                            { value: "SAP", label: "Settlement Access Provider" },
                            { value: "PDO", label: "Proxy Directory Operator" },
                        ]}
                        value={newActor.actorType}
                        onChange={(v) => setNewActor({ ...newActor, actorType: v as Actor["actorType"] })}
                        required
                    />
                    <TextInput
                        label="Organization Name"
                        placeholder="Your Organization"
                        value={newActor.name}
                        onChange={(e) => setNewActor({ ...newActor, name: e.target.value })}
                        required
                    />
                    <Select
                        label="Country"
                        data={[
                            { value: "SG", label: "Singapore" },
                            { value: "TH", label: "Thailand" },
                            { value: "MY", label: "Malaysia" },
                            { value: "PH", label: "Philippines" },
                            { value: "ID", label: "Indonesia" },
                        ]}
                        value={newActor.countryCode}
                        onChange={(v) => setNewActor({ ...newActor, countryCode: v || "" })}
                        required
                    />
                    <TextInput
                        label="Callback URL (Optional)"
                        placeholder="https://your-server.com/nexus/callback"
                        value={newActor.callbackUrl}
                        onChange={(e) => setNewActor({ ...newActor, callbackUrl: e.target.value })}
                        description="ISO 20022 messages will be delivered here"
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="outline" onClick={() => setModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRegister}>
                            Register
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
