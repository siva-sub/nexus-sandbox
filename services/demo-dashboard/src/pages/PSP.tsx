import { useState, useEffect, useCallback } from "react";
import {
    Title,
    Card,
    Stack,
    Group,
    Text,
    Badge,
    Table,
    Tabs,
    SimpleGrid,
    Select,
    Anchor,
    Breadcrumbs,
    Alert,
    Loader,
    Code,
} from "@mantine/core";
import {
    IconBuilding,
    IconInfoCircle,
    IconSend,
    IconInbox,
    IconWorld,
} from "@tabler/icons-react";
import { getPSPs, type PSP } from "../services/api";
import { DevDebugPanel } from "../components/DevDebugPanel";

export function PSPPage() {
    const [psps, setPsps] = useState<PSP[]>([]);
    const [selectedPSP, setSelectedPSP] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [countryFilter, setCountryFilter] = useState<string | null>(null);

    const loadPSPs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPSPs(countryFilter || undefined);
            setPsps(data.psps);
            if (data.psps.length > 0 && !selectedPSP) {
                setSelectedPSP(data.psps[0].bic);
            }
        } catch (e) {
            console.error("Failed to load PSPs:", e);
        } finally {
            setLoading(false);
        }
    }, [countryFilter, selectedPSP]);

    useEffect(() => {
        loadPSPs();
    }, [loadPSPs]);

    const selectedPSPData = psps.find((p) => p.bic === selectedPSP);

    const COUNTRY_OPTIONS = [
        { value: "", label: "All Countries" },
        { value: "SG", label: "🇸🇬 Singapore" },
        { value: "TH", label: "🇹🇭 Thailand" },
        { value: "MY", label: "🇲🇾 Malaysia" },
        { value: "PH", label: "🇵🇭 Philippines" },
        { value: "ID", label: "🇮🇩 Indonesia" },
        { value: "IN", label: "🇮🇳 India" },
    ];

    return (
        <Stack gap="md">
            <Breadcrumbs mb="xs">
                <Anchor href="/actors" size="xs">Actor Registry</Anchor>
                <Text size="xs" c="dimmed">Payment Service Providers</Text>
            </Breadcrumbs>

            <Group justify="space-between">
                <Title order={2}>Payment Service Provider (PSP) Dashboard</Title>
                <Badge color="teal" variant="light" leftSection={<IconBuilding size={14} />}>
                    PSP View
                </Badge>
            </Group>

            {/* PSP Role Explanation */}
            <Alert icon={<IconInfoCircle size={18} />} title="What is a Payment Service Provider (PSP)?" color="teal" variant="light">
                <Text size="sm">
                    PSPs are banks or payment institutions that initiate and receive cross-border payments through Nexus.
                    A <strong>Source PSP</strong> (Debtor Agent) sends payments on behalf of senders, while a{" "}
                    <strong>Destination PSP</strong> (Creditor Agent) receives and credits payments to recipients.
                </Text>
                <Anchor href="https://docs.nexusglobalpayments.org/introduction/terminology" size="xs" mt="xs">
                    Learn more in Nexus Documentation →
                </Anchor>
            </Alert>

            {/* Live Metrics Summary */}
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total PSPs</Text>
                        <IconBuilding size={20} color="var(--mantine-color-teal-6)" />
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{psps.length}</Text>
                    <Text size="xs" c="dimmed">Registered</Text>
                </Card>
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Countries</Text>
                        <IconWorld size={20} color="var(--mantine-color-blue-6)" />
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{new Set(psps.map(p => p.country_code)).size}</Text>
                    <Text size="xs" c="dimmed">Markets covered</Text>
                </Card>
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Avg Fee</Text>
                        <Badge size="sm" color="orange" variant="light">%</Badge>
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{psps.length > 0 ? (psps.reduce((sum, p) => sum + p.fee_percent, 0) / psps.length).toFixed(2) : 0}</Text>
                    <Text size="xs" c="dimmed">D-PSP fee rate</Text>
                </Card>
                <Card withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Selected</Text>
                        <Badge size="sm" color="teal" variant="light">Active</Badge>
                    </Group>
                    <Text size="xl" fw={700} mt="xs">{selectedPSP ? "1" : "0"}</Text>
                    <Text size="xs" c="dimmed">PSP in view</Text>
                </Card>
            </SimpleGrid>

            {/* PSP Selection */}
            <SimpleGrid cols={{ base: 1, md: 2 }}>
                <Select
                    label="Filter by Country"
                    data={COUNTRY_OPTIONS}
                    value={countryFilter || ""}
                    onChange={(v) => setCountryFilter(v || null)}
                    clearable
                />
                <Select
                    label="Select PSP"
                    placeholder="Choose a PSP to view"
                    data={psps.map((p) => ({ value: p.bic, label: `${p.name} (${p.bic})` }))}
                    value={selectedPSP}
                    onChange={setSelectedPSP}
                    searchable
                />
            </SimpleGrid>

            {loading ? (
                <Card p="xl" ta="center">
                    <Loader />
                    <Text c="dimmed" mt="md">Loading PSPs...</Text>
                </Card>
            ) : (
                <Tabs defaultValue="source">
                    <Tabs.List>
                        <Tabs.Tab value="source" leftSection={<IconSend size={14} />}>
                            Source PSP (Sending)
                        </Tabs.Tab>
                        <Tabs.Tab value="destination" leftSection={<IconInbox size={14} />}>
                            Destination PSP (Receiving)
                        </Tabs.Tab>
                        <Tabs.Tab value="registry" leftSection={<IconWorld size={14} />}>
                            PSP Registry
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="source" pt="md">
                        <SimpleGrid cols={{ base: 1, lg: 2 }}>
                            <Card>
                                <Title order={5} mb="md">Source PSP Responsibilities</Title>
                                <Stack gap="xs">
                                    <Text size="sm">• Initiate cross-border payments via Nexus</Text>
                                    <Text size="sm">• Request FX quotes from available FXPs</Text>
                                    <Text size="sm">• Perform sanctions screening on senders</Text>
                                    <Text size="sm">• Display fee disclosures to senders</Text>
                                    <Text size="sm">• Construct and submit pacs.008 messages</Text>
                                </Stack>
                            </Card>

                            <Card>
                                <Title order={5} mb="md">Selected PSP Details</Title>
                                {selectedPSPData ? (
                                    <Stack gap="sm">
                                        <Group justify="space-between">
                                            <Text c="dimmed">BIC</Text>
                                            <Code>{selectedPSPData.bic}</Code>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Name</Text>
                                            <Text fw={500}>{selectedPSPData.name}</Text>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Country</Text>
                                            <Badge>{selectedPSPData.country_code}</Badge>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text c="dimmed">Fee</Text>
                                            <Text>{(selectedPSPData.fee_percent * 100).toFixed(2)}%</Text>
                                        </Group>
                                    </Stack>
                                ) : (
                                    <Text c="dimmed">Select a PSP to view details</Text>
                                )}
                            </Card>
                        </SimpleGrid>
                    </Tabs.Panel>

                    <Tabs.Panel value="destination" pt="md">
                        <SimpleGrid cols={{ base: 1, lg: 2 }}>
                            <Card>
                                <Title order={5} mb="md">Destination PSP Responsibilities</Title>
                                <Stack gap="xs">
                                    <Text size="sm">• Receive pacs.008 from domestic IPS</Text>
                                    <Text size="sm">• Credit recipient accounts</Text>
                                    <Text size="sm">• Send pacs.002 confirmation/rejection</Text>
                                    <Text size="sm">• Handle payment returns if needed</Text>
                                    <Text size="sm">• Provide account resolution via PDO</Text>
                                </Stack>
                            </Card>

                            <Card>
                                <Title order={5} mb="md">Payment Flow Summary</Title>
                                <Text size="sm" c="dimmed" mb="md">
                                    Destination PSP receives payments via the domestic IPS after Nexus routes
                                    the cross-border transaction through the SAP.
                                </Text>
                                <Badge color="green" size="lg">Ready to Receive</Badge>
                            </Card>
                        </SimpleGrid>
                    </Tabs.Panel>

                    <Tabs.Panel value="registry" pt="md">
                        <Card>
                            <Title order={5} mb="md">Registered PSPs ({psps.length})</Title>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>BIC</Table.Th>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th>Country</Table.Th>
                                        <Table.Th>Fee</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {psps.map((psp) => (
                                        <Table.Tr key={psp.bic}>
                                            <Table.Td><Code>{psp.bic}</Code></Table.Td>
                                            <Table.Td>{psp.name}</Table.Td>
                                            <Table.Td><Badge size="sm">{psp.country_code}</Badge></Table.Td>
                                            <Table.Td>{(psp.fee_percent * 100).toFixed(2)}%</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Card>
                    </Tabs.Panel>
                </Tabs>
            )}

            {/* Developer Debug Panel for PSP Actor */}
            <DevDebugPanel context={{ actorType: "PSP", actorName: "Payment Service Provider" }} showToggle={true} />
        </Stack>
    );
}
