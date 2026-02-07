/**
 * Landing Page - Nexus Global Payments Sandbox
 * 
 * Professional entry point showcasing the system's capabilities and architecture.
 */

import { Container, Title, Text, Card, Group, Stack, SimpleGrid, ThemeIcon, Button, Badge, Divider } from "@mantine/core";
import {
    IconSend,
    IconArrowsExchange,
    IconCoin,
    IconNetwork,
    IconBuilding,
    IconAddressBook,
    IconReportAnalytics,
    IconFileCode,
    IconBrandGithub,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

interface FeatureCardProps {
    icon: typeof IconSend;
    title: string;
    description: string;
    path?: string;
    color: string;
}

function FeatureCard({ icon: Icon, title, description, path, color }: FeatureCardProps) {
    const navigate = useNavigate();

    return (
        <Card
            withBorder
            padding="lg"
            style={{ cursor: path ? "pointer" : "default" }}
            onClick={() => path && navigate(path)}
        >
            <Group gap="sm" mb="md">
                <ThemeIcon size="xl" color={color} variant="light">
                    <Icon size={24} />
                </ThemeIcon>
                <Title order={4}>{title}</Title>
            </Group>
            <Text size="sm" c="dimmed">
                {description}
            </Text>
        </Card>
    );
}

export function LandingPage() {
    const navigate = useNavigate();

    return (
        <Container size="xl" py="xl">
            <Stack gap="xl">
                {/* Hero Section */}
                <Stack gap="md" ta="center" py="xl">
                    <Badge size="lg" variant="light" color="nexusPurple">
                        High-Fidelity Behavioral Sandbox
                    </Badge>
                    <Title order={1} size={48}>
                        Nexus Global Payments Sandbox
                    </Title>
                    <Text size="xl" c="dimmed" maw={800} mx="auto">
                        A production-grade demonstration of cross-border instant payments using ISO 20022 messaging,
                        FX provision, and multilateral clearing architecture.
                    </Text>
                    <Group justify="center" mt="md">
                        <Button
                            size="lg"
                            leftSection={<IconSend size={20} />}
                            onClick={() => navigate("/payment")}
                            color="nexusPurple"
                        >
                            Send a Payment
                        </Button>
                        <Button
                            size="lg"
                            variant="light"
                            leftSection={<IconFileCode size={20} />}
                            onClick={() => navigate("/demo")}
                        >
                            Try Demo Scenarios
                        </Button>
                    </Group>
                </Stack>

                <Divider my="xl" />

                {/* What is Nexus? */}
                <Stack gap="md">
                    <Title order={2}>What is Nexus?</Title>
                    <Text>
                        Nexus is a <strong>multilateral cross-border instant payment system</strong> designed to connect
                        national instant payment systems (IPS) across borders. This sandbox implements the full payment
                        lifecycle with event sourcing, ISO 20022 compliance, and real-time FX provision.
                    </Text>
                    <Group gap="sm">
                        <Badge>ISO 20022</Badge>
                        <Badge>Event Sourcing</Badge>
                        <Badge>Real-time FX</Badge>
                        <Badge>100% Spec Parity</Badge>
                    </Group>
                </Stack>

                <Divider my="md" />

                {/* Core Features */}
                <Stack gap="md">
                    <Title order={2}>Core Features</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                        <FeatureCard
                            icon={IconSend}
                            title="Cross-Border Payments"
                            description="Initiate payments between countries with real-time FX conversion and proxy resolution."
                            path="/payment"
                            color="nexusPurple"
                        />
                        <FeatureCard
                            icon={IconArrowsExchange}
                            title="FX Rate Discovery"
                            description="Multi-provider FX quotes with tier-based improvements and 10-minute validity."
                            path="/fxp"
                            color="blue"
                        />
                        <FeatureCard
                            icon={IconCoin}
                            title="Liquidity Management"
                            description="Settlement Access Provider (SAP) balances and FXP account management."
                            path="/sap"
                            color="green"
                        />
                        <FeatureCard
                            icon={IconNetwork}
                            title="IPS Operator View"
                            description="Monitor payments flowing through source and destination Instant Payment Systems."
                            path="/ips"
                            color="orange"
                        />
                        <FeatureCard
                            icon={IconAddressBook}
                            title="Proxy Directory"
                            description="Resolve mobile numbers, emails, and IBANs to account details via PDO."
                            path="/pdo"
                            color="purple"
                        />
                        <FeatureCard
                            icon={IconReportAnalytics}
                            title="Payment Explorer"
                            description="Trace payments through the full lifecycle with ISO 20022 message inspection."
                            path="/explorer"
                            color="teal"
                        />
                    </SimpleGrid>
                </Stack>

                <Divider my="md" />

                {/* System Actors */}
                <Stack gap="md">
                    <Title order={2}>System Actors</Title>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                        <Card withBorder padding="md">
                            <Group gap="sm" mb="xs">
                                <ThemeIcon size="lg" color="nexusPurple" variant="light">
                                    <IconBuilding size={20} />
                                </ThemeIcon>
                                <Title order={4}>Payment Service Providers (PSPs)</Title>
                            </Group>
                            <Text size="sm" c="dimmed">
                                Banks and payment institutions that originate and receive payments for end customers.
                            </Text>
                        </Card>

                        <Card withBorder padding="md">
                            <Group gap="sm" mb="xs">
                                <ThemeIcon size="lg" color="blue" variant="light">
                                    <IconArrowsExchange size={20} />
                                </ThemeIcon>
                                <Title order={4}>FX Providers (FXPs)</Title>
                            </Group>
                            <Text size="sm" c="dimmed">
                                Third-party providers offering competitive exchange rates with tier-based pricing.
                            </Text>
                        </Card>

                        <Card withBorder padding="md">
                            <Group gap="sm" mb="xs">
                                <ThemeIcon size="lg" color="green" variant="light">
                                    <IconCoin size={20} />
                                </ThemeIcon>
                                <Title order={4}>Settlement Access Providers (SAPs)</Title>
                            </Group>
                            <Text size="sm" c="dimmed">
                                PSPs providing settlement accounts to FXPs for holding liquidity in multiple currencies.
                            </Text>
                        </Card>

                        <Card withBorder padding="md">
                            <Group gap="sm" mb="xs">
                                <ThemeIcon size="lg" color="orange" variant="light">
                                    <IconNetwork size={20} />
                                </ThemeIcon>
                                <Title order={4}>Instant Payment Systems (IPS)</Title>
                            </Group>
                            <Text size="sm" c="dimmed">
                                National clearing systems (e.g., FAST in Singapore, PromptPay in Thailand) connected via Nexus.
                            </Text>
                        </Card>
                    </SimpleGrid>
                </Stack>

                <Divider my="md" />

                {/* Footer */}
                <Group justify="center" py="xl">
                    <Button
                        variant="light"
                        leftSection={<IconBrandGithub size={18} />}
                        component="a"
                        href="https://github.com/siva-sub/nexus-sandbox"
                        target="_blank"
                    >
                        View on GitHub
                    </Button>
                    <Button
                        variant="subtle"
                        component="a"
                        href="/api/docs"
                        target="_blank"
                    >
                        API Documentation
                    </Button>
                </Group>
            </Stack>
        </Container>
    );
}
