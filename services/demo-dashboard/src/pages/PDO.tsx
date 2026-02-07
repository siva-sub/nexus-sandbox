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
    RingProgress,
} from "@mantine/core";
import {
    IconAddressBook,
    IconInfoCircle,
    IconPhone,
    IconMail,
    IconId,
} from "@tabler/icons-react";
import { getPDOs, getPDORegistrations, getPDOStats, type PDO, type ProxyRegistration } from "../services/api";
import { DevDebugPanel } from "../components/DevDebugPanel";

const PROXY_TYPE_ICONS: Record<string, React.ReactNode> = {
    MOBI: <IconPhone size={14} />,
    MBNO: <IconPhone size={14} />,
    EMAL: <IconMail size={14} />,
    NRIC: <IconId size={14} />,
    NIDN: <IconId size={14} />,
};

export function PDOPage() {
    const [pdos, setPdos] = useState<PDO[]>([]);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [registrations, setRegistrations] = useState<ProxyRegistration[]>([]);
    const [stats, setStats] = useState<{ total_registrations: number; registrations_by_type: Record<string, number> } | null>(null);
    const [loading, setLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(false);

    useEffect(() => {
        loadPDOs();
    }, []);

    useEffect(() => {
        if (selectedCountry) {
            loadData(selectedCountry);
        }
    }, [selectedCountry]);

    const loadPDOs = async () => {
        setLoading(true);
        try {
            const data = await getPDOs();
            setPdos(data.pdos);
            if (data.pdos.length > 0) {
                setSelectedCountry(data.pdos[0].country_code);
            }
        } catch (e) {
            console.error("Failed to load PDOs:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadData = async (countryCode: string) => {
        setDataLoading(true);
        try {
            const [regData, statsData] = await Promise.all([
                getPDORegistrations(countryCode),
                getPDOStats(countryCode),
            ]);
            setRegistrations(regData.registrations);
            setStats(statsData);
        } catch (e) {
            console.error("Failed to load PDO data:", e);
            setRegistrations([]);
            setStats(null);
        } finally {
            setDataLoading(false);
        }
    };

    const selectedPDO = pdos.find((p) => p.country_code === selectedCountry);

    return (
        <Stack gap="md">
            <Breadcrumbs mb="xs">
                <Anchor href="/actors" size="xs">Actor Registry</Anchor>
                <Text size="xs" c="dimmed">Proxy Directory Operators</Text>
            </Breadcrumbs>

            <Group justify="space-between">
                <Title order={2}>Proxy Directory Operator (PDO) Dashboard</Title>
                <Badge color="orange" variant="light" leftSection={<IconAddressBook size={14} />}>
                    PDO View
                </Badge>
            </Group>

            {/* PDO Role Explanation */}
            <Alert icon={<IconInfoCircle size={18} />} title="What is a Proxy Directory Operator (PDO)?" color="orange" variant="light">
                <Text size="sm">
                    A PDO maintains the mapping between proxies (aliases like mobile numbers) and bank accounts.
                    When a sender enters a mobile number, Nexus queries the PDO to resolve the recipient's
                    actual bank account details. PDOs ensure <strong>name masking</strong> for privacy protection.
                </Text>
                <Anchor href="https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/role-of-the-proxy-directory-operator-pdo" size="xs" mt="xs">
                    Learn more in Nexus Documentation →
                </Anchor>
            </Alert>

            {/* PDO Selection */}
            <Select
                label="Select PDO (by Country)"
                placeholder="Choose a PDO to view"
                data={pdos.map((p) => ({
                    value: p.country_code,
                    label: `${p.name} (${p.country_code})`,
                }))}
                value={selectedCountry}
                onChange={setSelectedCountry}
                w={400}
            />

            {loading ? (
                <Card p="xl" ta="center">
                    <Loader />
                    <Text c="dimmed" mt="md">Loading PDOs...</Text>
                </Card>
            ) : selectedPDO ? (
                <SimpleGrid cols={{ base: 1, lg: 2 }}>
                    <Card>
                        <Title order={5} mb="md">PDO Details</Title>
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Text c="dimmed">Name</Text>
                                <Text fw={500}>{selectedPDO.name}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text c="dimmed">Country</Text>
                                <Badge size="lg">{selectedPDO.country_code}</Badge>
                            </Group>
                            <Group justify="space-between">
                                <Text c="dimmed">Supported Proxy Types</Text>
                                <Group gap="xs">
                                    {selectedPDO.supported_proxy_types.map((type) => (
                                        <Badge key={type} variant="outline" size="sm" leftSection={PROXY_TYPE_ICONS[type]}>
                                            {type}
                                        </Badge>
                                    ))}
                                </Group>
                            </Group>
                        </Stack>
                    </Card>

                    <Card>
                        <Title order={5} mb="md">Registration Statistics</Title>
                        {dataLoading ? (
                            <Loader size="sm" />
                        ) : stats ? (
                            <Group>
                                <RingProgress
                                    size={120}
                                    thickness={12}
                                    sections={Object.entries(stats.registrations_by_type).map(([type, count], i) => ({
                                        value: (count / stats.total_registrations) * 100,
                                        color: ["blue", "green", "orange", "pink", "violet"][i % 5],
                                        tooltip: `${type}: ${count}`,
                                    }))}
                                    label={
                                        <Text ta="center" size="lg" fw={700}>
                                            {stats.total_registrations}
                                        </Text>
                                    }
                                />
                                <Stack gap="xs">
                                    {Object.entries(stats.registrations_by_type).map(([type, count]) => (
                                        <Group key={type} gap="xs">
                                            <Badge variant="light" leftSection={PROXY_TYPE_ICONS[type]}>{type}</Badge>
                                            <Text size="sm">{count} registrations</Text>
                                        </Group>
                                    ))}
                                </Stack>
                            </Group>
                        ) : (
                            <Text c="dimmed">No statistics available</Text>
                        )}
                    </Card>

                    <Card style={{ gridColumn: "span 2" }}>
                        <Title order={5} mb="md">Proxy Registrations (Sample)</Title>
                        <Text size="xs" c="dimmed" mb="md">
                            Names are masked for privacy as per Nexus specification.
                        </Text>
                        {dataLoading ? (
                            <Loader size="sm" />
                        ) : registrations.length > 0 ? (
                            <Table.ScrollContainer minWidth={500}>
                                <Table>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Type</Table.Th>
                                            <Table.Th>Proxy Value</Table.Th>
                                            <Table.Th>Masked Name</Table.Th>
                                            <Table.Th>Bank</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {registrations.map((reg, i) => (
                                            <Table.Tr key={i}>
                                                <Table.Td>
                                                    <Badge size="sm" variant="outline" leftSection={PROXY_TYPE_ICONS[reg.proxy_type]}>
                                                        {reg.proxy_type}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td><Code>{reg.proxy_value}</Code></Table.Td>
                                                <Table.Td>{reg.creditor_name_masked}</Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">{reg.bank_name}</Text>
                                                    <Text size="xs" c="dimmed">{reg.bank_bic}</Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        ) : (
                            <Text c="dimmed">No registrations found</Text>
                        )}
                    </Card>
                </SimpleGrid>
            ) : (
                <Card p="xl" ta="center">
                    <Text c="dimmed">Select a PDO to view details</Text>
                </Card>
            )}

            {/* Developer Debug Panel for PDO Actor */}
            <DevDebugPanel context={{ actorType: "PDO", actorName: "Proxy Directory Operator" }} showToggle={true} />
        </Stack>
    );
}
