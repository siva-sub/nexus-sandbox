import { useState, useEffect } from "react";
import {
    AppShell,
    Burger,
    Group,
    NavLink,
    Title,
    Text,
    Badge,
    useMantineColorScheme,
    ActionIcon,
    Box,
    Divider,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
    IconSend,
    IconArrowsExchange,
    IconCoin,
    IconMessage,
    IconSettings,
    IconMoon,
    IconSun,
    IconCircleCheck,
    IconCircleX,
    IconNetwork,
    IconUsers,
    IconBuilding,
    IconAddressBook,
    IconApi,
    IconExternalLink,
    IconReportAnalytics,
} from "@tabler/icons-react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { checkHealth } from "../../services/api";
import { DemoBanner } from "../DemoBanner";

interface NavItem {
    icon: typeof IconSend;
    label: string;
    path: string;
    description: string;
}

const navItems: NavItem[] = [
    {
        icon: IconSend,
        label: "Send Payment",
        path: "/payment",
        description: "PSP payment flow",
    },
    {
        icon: IconCircleX,
        label: "Demo Scenarios",
        path: "/demo",
        description: "Unhappy flows testing",
    },
    {
        icon: IconBuilding,
        label: "PSP Dashboard",
        path: "/psp",
        description: "Source/Dest PSP view",
    },
    {
        icon: IconArrowsExchange,
        label: "FX Rates (FXP)",
        path: "/fxp",
        description: "FXP rate management",
    },
    {
        icon: IconCoin,
        label: "Liquidity (SAP)",
        path: "/sap",
        description: "SAP balance view",
    },
    {
        icon: IconNetwork,
        label: "IPS Dashboard",
        path: "/ips",
        description: "IPS operator view",
    },
    {
        icon: IconAddressBook,
        label: "PDO Dashboard",
        path: "/pdo",
        description: "Proxy directory view",
    },
    {
        icon: IconReportAnalytics,
        label: "Payments Explorer",
        path: "/explorer",
        description: "Transaction lifecycle & messages",
    },
    {
        icon: IconMessage,
        label: "Messages",
        path: "/messages",
        description: "ISO 20022 explorer",
    },
    {
        icon: IconNetwork,
        label: "Network Mesh",
        path: "/mesh",
        description: "System mesh view",
    },
    {
        icon: IconUsers,
        label: "Actors",
        path: "/actors",
        description: "Participant registry",
    },
    {
        icon: IconSettings,
        label: "Settings",
        path: "/settings",
        description: "Configuration",
    },
];

export function AppLayout() {
    const [opened, { toggle }] = useDisclosure();
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const location = useLocation();
    const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "checking">("checking");

    useEffect(() => {
        const checkApiStatus = async () => {
            try {
                await checkHealth();
                setApiStatus("connected");
            } catch {
                setApiStatus("disconnected");
            }
        };

        checkApiStatus();
        const interval = setInterval(checkApiStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{
                width: 280,
                breakpoint: "sm",
                collapsed: { mobile: !opened },
            }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Group>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                        <Title order={3} c="nexusPurple">
                            🌐 NEXUS SANDBOX
                        </Title>
                        <Badge variant="light" color="nexusPurple" size="sm">
                            Demo
                        </Badge>
                    </Group>
                    <Group>
                        <Badge
                            color={apiStatus === "connected" ? "green" : apiStatus === "disconnected" ? "red" : "gray"}
                            variant="dot"
                            size="sm"
                        >
                            API: {apiStatus}
                        </Badge>
                        <ActionIcon
                            variant="subtle"
                            size="lg"
                            onClick={() => toggleColorScheme()}
                            title="Toggle color scheme"
                        >
                            {colorScheme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
                        </ActionIcon>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                <AppShell.Section grow>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            component={Link}
                            to={item.path}
                            label={item.label}
                            description={item.description}
                            leftSection={<item.icon size={20} />}
                            active={location.pathname === item.path}
                            onClick={() => toggle()}
                            mb="xs"
                        />
                    ))}
                </AppShell.Section>

                <AppShell.Section>
                    <Divider my="sm" />
                    <NavLink
                        component="a"
                        href="/api/docs"
                        target="_blank"
                        label="API Docs"
                        description="Swagger/OpenAPI"
                        leftSection={<IconApi size={20} />}
                        rightSection={<IconExternalLink size={14} />}
                        mb="xs"
                    />
                    <Box p="xs">
                        <Text size="xs" c="dimmed" mb="xs">
                            System Status
                        </Text>
                        <Group gap="xs">
                            {apiStatus === "connected" ? (
                                <IconCircleCheck size={16} color="var(--mantine-color-green-6)" />
                            ) : (
                                <IconCircleX size={16} color="var(--mantine-color-red-6)" />
                            )}
                            <Text size="xs">Gateway: {apiStatus}</Text>
                        </Group>
                    </Box>
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main>
                <DemoBanner />
                <Outlet />
            </AppShell.Main>
        </AppShell>
    );
}
