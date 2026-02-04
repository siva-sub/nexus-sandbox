import { useState, useEffect } from "react";
import {
    Title,
    Grid,
    Card,
    Group,
    Stack,
    Text,
    Button,
    Select,
    SegmentedControl,
    TextInput,
    Badge,
    Table,
    Timeline,
    Box,
    Alert,
    Tabs,
    Accordion,
    Progress,
    NumberInput,
    Anchor,
    Breadcrumbs,
    Switch,
    Collapse,
    Code,
    ActionIcon,
    CopyButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconSend,
    IconSearch,
    IconCheck,
    IconCircleDot,
    IconCircle,
    IconAlertCircle,
    IconCoin,
    IconUser,
    IconReceipt,
    IconCreditCard,
    IconClipboardList,
    IconInfoCircle,
    IconQrcode,
    IconCode,
    IconTransform,
    IconCopy,
} from "@tabler/icons-react";
import type { Country, Quote, FeeBreakdown, LifecycleStep, ProxyResolutionResult, IntermediaryAgentsResponse } from "../types";
import { getCountries, getQuotes, getAddressTypes, resolveProxy, getPreTransactionDisclosure, parseQRCode, getIntermediaryAgents } from "../services/api";

// 17-Step Lifecycle Definition
const LIFECYCLE_STEPS: Omit<LifecycleStep, "status" | "timestamp" | "details">[] = [
    { id: 1, phase: 1, name: "Select Country", apiCall: "GET /countries", isoMessage: "-" },
    { id: 2, phase: 1, name: "Define Amount", apiCall: "Validation", isoMessage: "-" },
    { id: 3, phase: 2, name: "Request FX Quotes", apiCall: "GET /quotes", isoMessage: "-" },
    { id: 4, phase: 2, name: "Generate Quotes", apiCall: "FXP Aggregation", isoMessage: "-" },
    { id: 5, phase: 2, name: "Select Quote", apiCall: "User Selection", isoMessage: "-" },
    { id: 6, phase: 2, name: "Display PTD", apiCall: "GET /fee-formulas/ptd", isoMessage: "-" },
    { id: 7, phase: 3, name: "Generate Address Form", apiCall: "GET /address-types", isoMessage: "-" },
    { id: 8, phase: 3, name: "Proxy Resolution", apiCall: "POST /iso20022/acmt023", isoMessage: "acmt.023" },
    { id: 9, phase: 3, name: "Confirmation of Payee", apiCall: "Response Processing", isoMessage: "acmt.024" },
    { id: 10, phase: 3, name: "Review Screening Data", apiCall: "Name Verification", isoMessage: "-" },
    { id: 11, phase: 3, name: "Sanctions Screening", apiCall: "AML/CFT Check", isoMessage: "-" },
    { id: 12, phase: 3, name: "Sender Authorization", apiCall: "User Consent", isoMessage: "-" },
    { id: 13, phase: 4, name: "Get Intermediaries", apiCall: "GET /intermediary-agents", isoMessage: "-" },
    { id: 14, phase: 4, name: "Construct pacs.008", apiCall: "Message Build", isoMessage: "pacs.008" },
    { id: 15, phase: 4, name: "Submit to IPS", apiCall: "POST /iso20022/pacs008", isoMessage: "pacs.008" },
    { id: 16, phase: 4, name: "Settlement Chain", apiCall: "Nexus → Dest IPS → SAP", isoMessage: "-" },
    { id: 17, phase: 5, name: "Accept & Notify", apiCall: "Response Processing", isoMessage: "pacs.002" },
];

const PHASE_NAMES = {
    1: "Payment Setup",
    2: "Quoting",
    3: "Addressing & Compliance",
    4: "Processing & Settlement",
    5: "Completion",
};

export function PaymentPage() {
    // Form state
    const [amount, setAmount] = useState<number | string>(1000);
    const [amountType, setAmountType] = useState<"SOURCE" | "DESTINATION">("SOURCE");
    const [sourceCountry, setSourceCountry] = useState<string | null>("SG"); // Default to Singapore
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null); // Destination country
    const [selectedProxyType, setSelectedProxyType] = useState<string | null>(null);
    const [recipientData, setRecipientData] = useState<Record<string, string>>({});

    // Data state
    const [countries, setCountries] = useState<Country[]>([]);
    const [proxyTypes, setProxyTypes] = useState<import("../types").AddressTypeWithInputs[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
    const [resolution, setResolution] = useState<ProxyResolutionResult | null>(null);
    const [recipientErrors, setRecipientErrors] = useState<Record<string, string | null>>({});
    const [intermediaries, setIntermediaries] = useState<IntermediaryAgentsResponse | null>(null);



    // Lifecycle state
    const [steps, setSteps] = useState<LifecycleStep[]>(
        LIFECYCLE_STEPS.map((s) => ({ ...s, status: "pending" as const }))
    );

    // Loading states
    const [loading, setLoading] = useState({ countries: false, resolve: false, submit: false, qrScan: false });
    const [devMode, setDevMode] = useState(false);
    const [now, setNow] = useState(Date.now());

    // Ticker for quote expiration
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // QR Scan state
    const [qrInput, setQrInput] = useState("");

    // Fetch countries on mount
    useEffect(() => {
        const fetchCountriesCount = async () => {
            setLoading((prev) => ({ ...prev, countries: true }));
            try {
                const data = await getCountries();
                setCountries(data.countries);
                advanceStep(1);
            } catch {
                // No fallback - require backend connection for Docker-ready release
                notifications.show({
                    title: "Gateway Unavailable",
                    message: "Could not connect to Nexus Gateway. Ensure 'docker compose up' is running.",
                    color: "red",
                    autoClose: false,
                });
            } finally {
                setLoading((prev) => ({ ...prev, countries: false }));
            }
        };
        fetchCountriesCount();
    }, []);

    // Update proxy types and quotes when country/amount changes
    useEffect(() => {
        if (selectedCountry) {
            const country = countries.find((c) => c.countryCode === selectedCountry);
            if (country) {
                // Fetch dynamic address types
                const fetchAddressData = async () => {
                    try {
                        const data = await getAddressTypes(selectedCountry);
                        setProxyTypes(data.addressTypes.map((t) => ({
                            ...t,
                            value: t.addressTypeId,
                            label: t.addressTypeName,
                        } as import("../types").AddressTypeWithInputs & { value: string; label: string })));

                    } catch {
                        // No fallback - address types come from backend DB
                        notifications.show({
                            title: "Address Types Error",
                            message: "Could not fetch address types. Check backend connection.",
                            color: "orange",
                        });
                    }
                };
                fetchAddressData();

                const fetchQuotesData = async () => {
                    try {
                        const data = await getQuotes(sourceCountry || "SG", selectedCountry, Number(amount), amountType);
                        setQuotes(data.quotes);
                    } catch {
                        // No fallback - quotes come from FXP via backend
                        notifications.show({
                            title: "Quotes Unavailable",
                            message: "Could not fetch FX quotes. Ensure FX are seeded in database.",
                            color: "orange",
                        });
                    }
                };
                fetchQuotesData();
                setSelectedQuote(null);
                setFeeBreakdown(null);
                advanceStep(3);
            }
        }
    }, [selectedCountry, sourceCountry, amount, amountType, countries]);

    // Quote expiration detection
    useEffect(() => {
        if (selectedQuote) {
            const expiresAt = new Date(selectedQuote.expiresAt).getTime();
            const isExpired = now >= expiresAt;

            if (isExpired) {
                // Clear the expired quote
                setSelectedQuote(null);
                setFeeBreakdown(null);

                // Show notification
                notifications.show({
                    title: "Quote Expired",
                    message: "Your selected quote has expired. Please select a new quote to continue.",
                    color: "orange",
                    icon: <IconAlertCircle size={16} />,
                    autoClose: 5000,
                });

                // Refresh quotes if we have the necessary data
                if (selectedCountry && sourceCountry && amount) {
                    const refreshQuotes = async () => {
                        try {
                            const quotesData = await getQuotes(sourceCountry, selectedCountry, Number(amount), amountType);
                            setQuotes(quotesData.quotes);
                            advanceStep(5);
                        } catch {
                            notifications.show({
                                title: "Quote Refresh Failed",
                                message: "Could not fetch new quotes. Please try again.",
                                color: "red",
                            });
                        }
                    };
                    refreshQuotes();
                }
            }
        }
    }, [selectedQuote, now, selectedCountry, sourceCountry, amount, amountType]);

    // Clear selected items when state changes
    useEffect(() => {
        setSelectedQuote(null);
        setFeeBreakdown(null);
        setResolution(null);
        setRecipientData({});
        setRecipientErrors({});
        setIntermediaries(null);
    }, [selectedCountry, amount]);

    const advanceStep = (stepId: number) => {
        setSteps((prev) =>
            prev.map((s) => ({
                ...s,
                status: s.id < stepId ? "completed" : s.id === stepId ? "active" : "pending",
                timestamp: s.id === stepId ? new Date().toLocaleTimeString() : s.timestamp,
            }))
        );
    };

    const handleResolve = async () => {
        const typeData = proxyTypes.find(t => t.value === selectedProxyType);
        const requiredFields = typeData?.inputs?.map((i: import("../types").AddressTypeInputDetails) => i.fieldName) || [];
        const hasAllFields = requiredFields.every((f) => !!recipientData[f]);

        if (!selectedCountry || !selectedProxyType || !hasAllFields) {
            notifications.show({ title: "Validation", message: "Please fill all required recipient fields", color: "yellow" });
            return;
        }

        setLoading((prev) => ({ ...prev, resolve: true }));
        setResolution(null);  // Clear previous resolution
        advanceStep(8);

        try {
            // Join multi-field labels if necessary, or pass the primary identifier
            // For sandbox, we use the first field as the main "proxy value"
            const primaryValue = recipientData[requiredFields[0]];
            const result = await resolveProxy(selectedCountry, selectedProxyType, primaryValue, recipientData);
            setResolution({ ...result, verified: true });
            advanceStep(10);
            notifications.show({
                title: "Recipient Verified",
                message: `Identity: ${result.beneficiaryName || result.accountName}`,
                color: "green",
                icon: <IconCheck size={16} />,
            });
        } catch (err: unknown) {
            const e = err as Error & { statusReasonCode?: string; detail?: string };
            // Mark step 8 as error state
            setSteps((prev) =>
                prev.map((s) => ({
                    ...s,
                    status: s.id === 8 ? "error" : s.status,
                }))
            );

            // ISO 20022 Error Code mapping
            const errorCodeDescriptions: Record<string, string> = {
                'BE23': 'Account/Proxy Invalid - Not registered in destination country PDO',
                'AC04': 'Account Closed - Recipient account has been closed',
                'AC01': 'Incorrect Account Number - Invalid format',
                'RR04': 'Regulatory Block - AML/CFT screening failed',
                'AGNT': 'Incorrect Agent - PSP not onboarded to Nexus',
            };

            const statusCode = e.statusReasonCode || 'UNKNOWN';
            const description = errorCodeDescriptions[statusCode] || e.detail || 'Could not resolve proxy';

            // Set error resolution for display
            setResolution({
                status: "FAILED",
                verified: false,
                error: statusCode,
                errorMessage: description,
            });

            notifications.show({
                title: `Resolution Failed (${statusCode})`,
                message: description,
                color: "red",
                icon: <IconAlertCircle size={16} />,
                autoClose: 8000,
            });
        } finally {
            setLoading((prev) => ({ ...prev, resolve: false }));
        }
    };

    // QR Code scan handler - parses EMVCo QR and auto-populates recipient fields
    const handleQrScan = async () => {
        if (!qrInput.trim()) {
            notifications.show({ title: "QR Scan", message: "Please paste QR code data", color: "yellow" });
            return;
        }

        setLoading((prev) => ({ ...prev, qrScan: true }));

        try {
            const result = await parseQRCode(qrInput);

            if (!result.crcValid) {
                notifications.show({ title: "Invalid QR", message: "CRC checksum failed", color: "red" });
                return;
            }

            // Map scheme to country code
            const schemeCountryMap: Record<string, string> = {
                PAYNOW: "SG",
                PROMPTPAY: "TH",
                QRPH: "PH",
                DUITNOW: "MY",
            };

            const countryCode = schemeCountryMap[result.merchantAccountInfo.scheme];

            if (countryCode && countries.some((c) => c.countryCode === countryCode)) {
                setSelectedCountry(countryCode);
            }

            // Set proxy type and value
            if (result.merchantAccountInfo.proxyType) {
                setSelectedProxyType(result.merchantAccountInfo.proxyType);
            }
            if (result.merchantAccountInfo.proxyValue) {
                const proxyKey = result.merchantAccountInfo.proxyType || "proxyValue";
                const val = result.merchantAccountInfo.proxyValue;
                setRecipientData(prev => ({ ...prev, [proxyKey]: val }));
            }

            // Set amount if present
            if (result.transactionAmount) {
                setAmount(Number(result.transactionAmount));
            }

            setQrInput(""); // Clear input

            notifications.show({
                title: "QR Scanned",
                message: `${result.merchantAccountInfo.scheme}: ${result.merchantName || "Payment"}`,
                color: "green",
                icon: <IconQrcode size={16} />,
            });

        } catch {
            notifications.show({ title: "QR Parse Failed", message: "Invalid EMVCo QR format", color: "red" });
        } finally {
            setLoading((prev) => ({ ...prev, qrScan: false }));
        }
    };

    const handleQuoteSelect = async (quote: Quote) => {
        setSelectedQuote(quote);
        try {
            // Step 6: PTD
            const data = await getPreTransactionDisclosure(quote.quoteId);
            setFeeBreakdown(data);
            advanceStep(6);

            // Step 13: Intermediary Agents
            const interData = await getIntermediaryAgents(quote.quoteId);
            setIntermediaries(interData);
            advanceStep(13);
        } catch {
            notifications.show({ title: "Error", message: "Failed to fetch required payment data", color: "red" });
        }
    };

    const handleSubmit = async () => {
        setLoading((prev) => ({ ...prev, submit: true }));

        for (let step = 12; step <= 17; step++) {
            advanceStep(step);
            await new Promise((r) => setTimeout(r, 800));
        }

        // Mark step 17 as completed by advancing to a virtual step 18
        // This ensures the final "Accept & Notify" step shows as green checkmark
        advanceStep(18);

        setLoading((prev) => ({ ...prev, submit: false }));

        notifications.show({
            title: "Payment Complete",
            message: "Transaction completed successfully (pacs.002 ACCC)",
            color: "green",
            icon: <IconCheck size={16} />,
        });
    };

    const getStepIcon = (status: LifecycleStep["status"]) => {
        switch (status) {
            case "completed": return <IconCheck size={12} />;
            case "active": return <IconCircleDot size={12} />;
            case "error": return <IconAlertCircle size={12} />;
            default: return <IconCircle size={12} />;
        }
    };

    const getStepColor = (status: LifecycleStep["status"]) => {
        switch (status) {
            case "completed": return "green";
            case "active": return "blue";
            case "error": return "red";
            default: return "gray";
        }
    };

    // Group steps by phase
    const stepsByPhase = Object.entries(PHASE_NAMES).map(([phase, name]) => ({
        phase: Number(phase),
        name,
        steps: steps.filter((s) => s.phase === Number(phase)),
    }));

    const selectedCountryData = countries.find((c) => c.countryCode === selectedCountry);

    return (
        <Stack gap="lg">
            <Breadcrumbs mb="xs">
                <Anchor href="/actors" size="xs">Actor Registry</Anchor>
                <Text size="xs" c="dimmed">Global Payment Dashboard</Text>
            </Breadcrumbs>
            <Group justify="space-between">
                <Title order={2}>Global Payment Dashboard</Title>
                <Group>
                    <Switch
                        label="Developer Mode"
                        size="sm"
                        checked={devMode}
                        onChange={(e) => setDevMode(e.currentTarget.checked)}
                        color="violet"
                    />
                    <Anchor href="/mesh" size="sm">View Network Mesh</Anchor>
                    <Badge size="lg" color="green" variant="light">
                        Sandbox Connected
                    </Badge>
                </Group>
            </Group>

            <Grid gutter="xl">
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Stack gap="md">
                        <Card withBorder radius="md" p="xl" bg="var(--mantine-color-dark-7)">
                            <Stack gap="md">
                                <Title order={5}>
                                    <Group gap="xs">
                                        <IconCreditCard size={20} color="var(--mantine-color-blue-filled)" />
                                        Sender Information
                                    </Group>
                                </Title>
                                <Select
                                    label="Source Country"
                                    placeholder="Select sending country"
                                    data={countries.map((c) => ({ value: c.countryCode, label: c.name }))}
                                    value={sourceCountry}
                                    onChange={(val) => setSourceCountry(val)}
                                    searchable
                                    allowDeselect={false}
                                />
                                <Stack gap="xs">
                                    <Text size="sm" fw={500}>Amount Specification</Text>
                                    <SegmentedControl
                                        value={amountType}
                                        onChange={(val) => setAmountType(val as "SOURCE" | "DESTINATION")}
                                        data={[
                                            { value: "SOURCE", label: "I want to send" },
                                            { value: "DESTINATION", label: "Recipient gets" },
                                        ]}
                                        size="sm"
                                    />
                                </Stack>
                                <NumberInput
                                    label={amountType === "SOURCE"
                                        ? `Amount to Send (${countries.find(c => c.countryCode === sourceCountry)?.currencies?.[0]?.currencyCode || "SGD"})`
                                        : `Amount to Receive (${selectedCountryData?.currencies?.[0]?.currencyCode || "Destination Currency"})`}
                                    value={Number(amount)}
                                    onChange={(val) => setAmount(val)}
                                    min={1}
                                    thousandSeparator=","
                                    description={amountType === "SOURCE"
                                        ? "System will calculate how much recipient receives"
                                        : "System will calculate how much to debit from your account"}
                                />
                            </Stack>
                        </Card>

                        <Card withBorder radius="md" p="xl">
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Title order={5}>
                                        <Group gap="xs">
                                            <IconUser size={20} color="var(--mantine-color-green-filled)" />
                                            Recipient Information
                                        </Group>
                                    </Title>
                                    <Badge color="grape" variant="light" leftSection={<IconQrcode size={12} />}>
                                        EMVCo QR
                                    </Badge>
                                </Group>

                                {/* QR Scan Input */}
                                <TextInput
                                    placeholder="Paste EMVCo QR data (SGQR, PromptPay, QRPh...)"
                                    value={qrInput}
                                    onChange={(e) => setQrInput(e.currentTarget.value)}
                                    rightSection={
                                        <Button
                                            size="compact-xs"
                                            variant="light"
                                            color="grape"
                                            onClick={handleQrScan}
                                            loading={loading.qrScan}
                                            disabled={!qrInput.trim()}
                                        >
                                            <IconQrcode size={14} />
                                        </Button>
                                    }
                                />
                                <Select
                                    label="Destination Country"
                                    placeholder="Select country"
                                    data={countries.map((c) => ({ value: c.countryCode, label: c.name }))}
                                    value={selectedCountry}
                                    onChange={setSelectedCountry}
                                    searchable
                                />
                                <Select
                                    label="Target Proxy Type"
                                    placeholder="Select method"
                                    data={proxyTypes.map(t => ({ value: t.value || t.addressTypeId, label: t.label || t.addressTypeName }))}
                                    value={selectedProxyType}
                                    onChange={setSelectedProxyType}
                                    disabled={!selectedCountry}
                                />
                                {proxyTypes.find(t => t.value === selectedProxyType)?.inputs?.map((input: import("../types").AddressTypeInputDetails) => (
                                    <TextInput
                                        key={input.fieldName}
                                        label={input.displayLabel}
                                        placeholder={input.attributes?.placeholder || ""}
                                        value={recipientData[input.fieldName] || ""}
                                        error={recipientErrors[input.fieldName]}
                                        onChange={(e) => {
                                            const val = e.currentTarget.value;
                                            setRecipientData(prev => ({ ...prev, [input.fieldName]: val }));

                                            // Validate against backend regex
                                            const pattern = input.attributes?.pattern;
                                            if (pattern && val) {
                                                const regex = new RegExp(pattern);
                                                if (!regex.test(val)) {
                                                    setRecipientErrors(prev => ({
                                                        ...prev,
                                                        [input.fieldName]: `Invalid format. Expected: ${input.attributes?.placeholder || "correct format"}`
                                                    }));
                                                } else {
                                                    setRecipientErrors(prev => ({ ...prev, [input.fieldName]: null }));
                                                }
                                            } else {
                                                setRecipientErrors(prev => ({ ...prev, [input.fieldName]: null }));
                                            }
                                        }}
                                        disabled={!selectedProxyType}
                                        rightSection={
                                            input === proxyTypes.find(t => t.value === selectedProxyType)?.inputs?.[0] && (
                                                <Button
                                                    size="compact-xs"
                                                    variant="subtle"
                                                    onClick={handleResolve}
                                                    loading={loading.resolve}
                                                    disabled={!Object.values(recipientData).some(v => v) || Object.values(recipientErrors).some(e => e)}
                                                >
                                                    <IconSearch size={14} />
                                                </Button>
                                            )
                                        }
                                    />
                                ))}


                                {resolution && resolution.verified && (
                                    <Alert color="green" title="Recipient Verified" icon={<IconCheck size={16} />} p="xs">
                                        <Stack gap={4}>
                                            <Text size="xs" fw={700}>Name: {resolution.beneficiaryName || resolution.accountName}</Text>
                                            <Text size="xs">A/C: {resolution.accountNumber}</Text>
                                            <Text size="xs">Bank/BIC: {resolution.agentBic || resolution.bankName}</Text>
                                        </Stack>
                                    </Alert>
                                )}

                                {resolution && !resolution.verified && (
                                    <Alert color="red" title={`Resolution Failed (${resolution.error || "UNKNOWN"})`} icon={<IconAlertCircle size={16} />} p="xs">
                                        <Stack gap={4}>
                                            <Text size="xs" fw={700}>Error Code: {resolution.error}</Text>
                                            <Text size="xs">{resolution.errorMessage}</Text>
                                            <Text size="xs" c="dimmed">Reference: ISO 20022 ExternalStatusReason1Code</Text>
                                        </Stack>
                                    </Alert>
                                )}
                                <Button
                                    fullWidth
                                    leftSection={<IconSend size={16} />}
                                    loading={loading.submit}
                                    disabled={!selectedQuote || !resolution || !resolution.verified}
                                    onClick={handleSubmit}
                                >
                                    Confirm & Send
                                </Button>
                            </Stack>
                        </Card>
                    </Stack>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Tabs defaultValue="quotes">
                        <Tabs.List mb="md">
                            <Tabs.Tab value="quotes" leftSection={<IconCoin size={16} />}>
                                FX Quotes
                            </Tabs.Tab>
                            <Tabs.Tab value="lifecycle" leftSection={<IconClipboardList size={16} />}>
                                Lifecycle Trace
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="quotes">
                            <Stack gap="md">
                                {quotes.length > 0 ? (
                                    quotes.map((quote) => (
                                        <Card
                                            key={quote.quoteId}
                                            withBorder
                                            radius="md"
                                            p="md"
                                            onClick={() => handleQuoteSelect(quote)}
                                            style={{
                                                cursor: "pointer",
                                                borderColor: selectedQuote?.quoteId === quote.quoteId
                                                    ? "var(--mantine-color-blue-filled)"
                                                    : undefined,
                                                backgroundColor: selectedQuote?.quoteId === quote.quoteId
                                                    ? "var(--mantine-color-blue-light)"
                                                    : undefined
                                            }}
                                        >
                                            <Group justify="space-between" align="flex-start">
                                                <Box>
                                                    {/* Show net to recipient when available */}
                                                    {quote.creditorAccountAmount ? (
                                                        <>
                                                            <Text fw={700} size="lg" c="green">
                                                                {selectedCountryData?.currencies[0]?.currencyCode} {Number(quote.creditorAccountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </Text>
                                                            <Text size="xs" c="dimmed">
                                                                Net to recipient (after {quote.destinationPspFee ? `${selectedCountryData?.currencies[0]?.currencyCode} ${Number(quote.destinationPspFee).toLocaleString()} fee` : 'D-PSP fee'})
                                                            </Text>
                                                        </>
                                                    ) : (
                                                        <Text fw={700} size="lg">
                                                            {selectedCountryData?.currencies[0]?.currencyCode} {quote.destinationInterbankAmount}
                                                        </Text>
                                                    )}
                                                    <Text size="xs" c="dimmed" mt={4}>
                                                        via {quote.fxpName} • Rate: {Number(quote.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                    </Text>
                                                </Box>
                                                <Stack gap={2} align="flex-end">
                                                    <Badge size="xs" color="blue">
                                                        Quote Lock
                                                    </Badge>
                                                    {(() => {
                                                        const expiresAt = new Date(quote.expiresAt).getTime();
                                                        const remainingSecs = Math.max(0, Math.floor((expiresAt - now) / 1000));
                                                        const totalSecs = 600; // 10 minutes total
                                                        const progressPct = (remainingSecs / totalSecs) * 100;
                                                        const isWarning = remainingSecs <= 60;
                                                        const isCritical = remainingSecs <= 30;

                                                        return (
                                                            <>
                                                                <Progress
                                                                    value={progressPct}
                                                                    size="xs"
                                                                    w={60}
                                                                    color={isCritical ? "red" : isWarning ? "orange" : "blue"}
                                                                    radius="xl"
                                                                />
                                                                <Text
                                                                    size="xs"
                                                                    c={isCritical ? "red" : isWarning ? "orange" : "dimmed"}
                                                                    fw={isWarning ? 600 : 400}
                                                                >
                                                                    {remainingSecs > 60
                                                                        ? `${Math.floor(remainingSecs / 60)}m ${remainingSecs % 60}s`
                                                                        : `${remainingSecs}s`}
                                                                    {isCritical && " ⚠️"}
                                                                </Text>
                                                            </>
                                                        );
                                                    })()}
                                                </Stack>
                                            </Group>
                                        </Card>
                                    ))
                                ) : (
                                    <Alert icon={<IconAlertCircle size={16} />} title="Quoting" color="blue">
                                        Select a destination country to retrieve live multi-provider quotes via Nexus FXP Aggregation.
                                    </Alert>
                                )}
                                {feeBreakdown && <FeeCard fee={feeBreakdown} quote={selectedQuote} now={now} />}
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value="lifecycle">
                            <Card>
                                <Group gap="xs" mb="md">
                                    <IconClipboardList size={20} color="var(--mantine-color-nexusPurple-filled)" />
                                    <Title order={5}>Payment Lifecycle</Title>
                                </Group>
                                <LifecycleAccordion
                                    stepsByPhase={stepsByPhase}
                                    getStepIcon={getStepIcon}
                                    getStepColor={getStepColor}
                                    feeBreakdown={feeBreakdown}
                                    resolution={resolution}
                                    intermediaries={intermediaries}
                                />
                            </Card>
                        </Tabs.Panel>
                    </Tabs>
                </Grid.Col>
            </Grid>

            {/* Developer Debug Panel - Shows ISO message traces and transformations */}
            <Collapse in={devMode}>
                <Card withBorder radius="md" p="lg" bg="var(--mantine-color-dark-8)" mt="lg">
                    <Group justify="space-between" mb="md">
                        <Group gap="xs">
                            <IconCode size={24} color="var(--mantine-color-violet-filled)" />
                            <Title order={4}>Developer Debug Panel</Title>
                        </Group>
                        <Badge color="violet" variant="light">ISO 20022 Message Traces</Badge>
                    </Group>

                    <Stack gap="md">
                        {/* Transaction Tracking IDs */}
                        <Card withBorder radius="sm" p="md" bg="var(--mantine-color-dark-7)">
                            <Group gap="xs" mb="sm">
                                <IconTransform size={18} color="var(--mantine-color-blue-filled)" />
                                <Text size="sm" fw={700}>Transaction Tracking</Text>
                            </Group>
                            <Table withColumnBorders verticalSpacing="xs" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Field</Table.Th>
                                        <Table.Th>Value</Table.Th>
                                        <Table.Th>Purpose</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td><Code>UETR</Code></Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Code>{selectedQuote?.quoteId || 'Pending quote'}</Code>
                                                {selectedQuote && (
                                                    <CopyButton value={selectedQuote.quoteId}>
                                                        {({ copied, copy }) => (
                                                            <ActionIcon onClick={copy} color={copied ? 'teal' : 'gray'} size="sm" variant="subtle">
                                                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                            </ActionIcon>
                                                        )}
                                                    </CopyButton>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Unique End-to-End Transaction Reference (UUID v4)</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Code>Quote ID</Code></Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Code>{selectedQuote?.quoteId || '-'}</Code>
                                                {selectedQuote && (
                                                    <CopyButton value={selectedQuote.quoteId}>
                                                        {({ copied, copy }) => (
                                                            <ActionIcon onClick={copy} color={copied ? 'teal' : 'gray'} size="sm" variant="subtle">
                                                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                            </ActionIcon>
                                                        )}
                                                    </CopyButton>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Links payment to locked FX rate</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Code>IntermediaryAgent1</Code></Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Code>{intermediaries?.intermediaryAgent1?.bic || 'Pending'}</Code>
                                                {intermediaries?.intermediaryAgent1 && (
                                                    <CopyButton value={intermediaries.intermediaryAgent1.bic}>
                                                        {({ copied, copy }) => (
                                                            <ActionIcon onClick={copy} color={copied ? 'teal' : 'gray'} size="sm" variant="subtle">
                                                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                            </ActionIcon>
                                                        )}
                                                    </CopyButton>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Source SAP (FXP account for source currency)</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Code>IntermediaryAgent2</Code></Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Code>{intermediaries?.intermediaryAgent2?.bic || 'Pending'}</Code>
                                                {intermediaries?.intermediaryAgent2 && (
                                                    <CopyButton value={intermediaries.intermediaryAgent2.bic}>
                                                        {({ copied, copy }) => (
                                                            <ActionIcon onClick={copy} color={copied ? 'teal' : 'gray'} size="sm" variant="subtle">
                                                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                                            </ActionIcon>
                                                        )}
                                                    </CopyButton>
                                                )}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Destination SAP (FXP account for dest currency)</Text></Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>

                        {/* Message Transformation View */}
                        <Card withBorder radius="sm" p="md" bg="var(--mantine-color-dark-7)">
                            <Group gap="xs" mb="sm">
                                <IconTransform size={18} color="var(--mantine-color-green-filled)" />
                                <Text size="sm" fw={700}>Nexus Gateway Transformations</Text>
                            </Group>
                            <Alert color="violet" variant="light" mb="md">
                                <Text size="xs">
                                    The Nexus Gateway performs these transformations as pacs.008 passes from Source → Destination:
                                </Text>
                            </Alert>
                            <Table withColumnBorders verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Transformation</Table.Th>
                                        <Table.Th>Source Leg (Input)</Table.Th>
                                        <Table.Th>Destination Leg (Output)</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td><Badge color="blue" variant="light" size="sm">Agent Swapping</Badge></Table.Td>
                                        <Table.Td>
                                            <Text size="xs">InstructingAgent: <Code>Source PSP</Code></Text>
                                            <Text size="xs">InstructedAgent: <Code>Source SAP</Code></Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs">InstructingAgent: <Code>{intermediaries?.intermediaryAgent2?.bic || 'Dest SAP'}</Code></Text>
                                            <Text size="xs">InstructedAgent: <Code>Dest PSP</Code></Text>
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="green" variant="light" size="sm">Amount Conversion</Badge></Table.Td>
                                        <Table.Td>
                                            <Text size="xs">InterbankSettlementAmount:</Text>
                                            <Code>{feeBreakdown?.sourceCurrency || sourceCountry} {selectedQuote?.sourceInterbankAmount || amount}</Code>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs">InterbankSettlementAmount:</Text>
                                            <Code>{feeBreakdown?.destinationCurrency || selectedCountry} {selectedQuote?.destinationInterbankAmount || '-'}</Code>
                                        </Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="orange" variant="light" size="sm">Clearing System</Badge></Table.Td>
                                        <Table.Td><Code>{sourceCountry === 'SG' ? 'FAST' : sourceCountry === 'TH' ? 'PromptPay' : sourceCountry === 'MY' ? 'DuitNow' : sourceCountry === 'PH' ? 'InstaPay' : sourceCountry === 'ID' ? 'QRIS' : 'UPI'}</Code></Table.Td>
                                        <Table.Td><Code>{selectedCountry === 'SG' ? 'FAST' : selectedCountry === 'TH' ? 'PromptPay' : selectedCountry === 'MY' ? 'DuitNow' : selectedCountry === 'PH' ? 'InstaPay' : selectedCountry === 'ID' ? 'QRIS' : selectedCountry === 'IN' ? 'UPI' : '-'}</Code></Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>

                        {/* Actor Response Codes */}
                        <Card withBorder radius="sm" p="md" bg="var(--mantine-color-dark-7)">
                            <Group gap="xs" mb="sm">
                                <IconInfoCircle size={18} color="var(--mantine-color-orange-filled)" />
                                <Text size="sm" fw={700}>Actor Response Codes (pacs.002)</Text>
                            </Group>
                            <Table withColumnBorders verticalSpacing="xs" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Code</Table.Th>
                                        <Table.Th>Status</Table.Th>
                                        <Table.Th>Description</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td><Badge color="green">ACCC</Badge></Table.Td>
                                        <Table.Td>Accepted</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Payment successful, recipient credited</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">AB03</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Settlement Timeout (SLA breach)</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">AB04</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Rate mismatch with Quote ID</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">AM04</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Insufficient Funds (FXP ran out of liquidity)</Text></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td><Badge color="red">BE23</Badge></Table.Td>
                                        <Table.Td>Rejected</Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">Proxy not found (acmt.024 verification failed)</Text></Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Card>
                    </Stack>
                </Card>
            </Collapse>
        </Stack>
    );
}

// Fee breakdown card component - displays Pre-Transaction Disclosure
// With proper invariants: payout_gross = recipient_net + dest_fee, sender_total = principal + fees
function FeeCard({ fee, quote, now }: { fee: FeeBreakdown; quote: Quote | null; now: number }) {
    // Helper to safely parse numbers - returns 0 if NaN
    const safeNumber = (val: string | undefined | null): number => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    // Use totalCostPercent from backend (calculated vs mid-market benchmark)
    const totalCostPct = Math.abs(safeNumber(fee.totalCostPercent));
    const isWithinG20 = totalCostPct <= 3.0;

    return (
        <Card withBorder radius="md" p="xl" bg="var(--mantine-color-dark-8)">
            <Group justify="space-between" mb="lg">
                <Group gap="xs">
                    <IconReceipt size={24} color="var(--mantine-color-blue-filled)" />
                    <Title order={4}>Pre-Transaction Disclosure</Title>
                </Group>
                <Badge
                    color={isWithinG20 ? "green" : "orange"}
                    variant="light"
                    leftSection={<IconInfoCircle size={14} />}
                >
                    {totalCostPct.toFixed(2)}% Cost vs Mid-Market
                </Badge>
            </Group>

            {/* G20 Alignment Visualization */}
            <Box mb="xl">
                <Group justify="space-between" mb={5}>
                    <Text size="xs" fw={700} tt="uppercase">G20 Target Alignment (&lt; 3%)</Text>
                    <Text size="xs" c={isWithinG20 ? "green" : "orange"}>
                        {isWithinG20 ? "Target Met" : "Above Target"}
                    </Text>
                </Group>
                <Progress
                    value={Math.min(100, (totalCostPct / 3.0) * 100)}
                    color={isWithinG20 ? "green" : "orange"}
                    size="sm"
                    radius="xl"
                />
            </Box>

            <Stack gap="xl">
                {/* Sender Side (Amount to be Debited) */}
                <Box>
                    <Text size="sm" c="dimmed">Amount to be Debited (Total)</Text>
                    <Text size="xl" fw={700} c="blue">
                        {fee.sourceCurrency} {safeNumber(fee.senderTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                </Box>

                {/* Recipient Side (Amount Received) */}
                <Box>
                    <Text size="sm" c="dimmed">Amount Recipient Receives (Net)</Text>
                    <Text size="xl" fw={700} c="green">
                        {fee.destinationCurrency} {safeNumber(fee.recipientNetAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                </Box>

                {/* Fee Breakdown Table - with reconciliation */}
                <Table withColumnBorders={false} verticalSpacing="sm">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Td fw={500}>Sender Principal (FX Amount)</Table.Td>
                            <Table.Td ta="right">{fee.sourceCurrency} {safeNumber(fee.senderPrincipal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td c="dimmed" pl="lg">+ Source PSP Fee ({fee.sourcePspFeeType})</Table.Td>
                            <Table.Td ta="right" c="dimmed">{fee.sourceCurrency} {safeNumber(fee.sourcePspFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td c="dimmed" pl="lg">+ Nexus Scheme Fee</Table.Td>
                            <Table.Td ta="right" c="dimmed">{fee.sourceCurrency} {safeNumber(fee.schemeFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}>
                            <Table.Td fw={600}>= Total Debited</Table.Td>
                            <Table.Td ta="right" fw={600}>{fee.sourceCurrency} {safeNumber(fee.senderTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>

                <Table withColumnBorders={false} verticalSpacing="sm">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Td fw={500}>Payout Amount (Gross)</Table.Td>
                            <Table.Td ta="right">{fee.destinationCurrency} {safeNumber(fee.payoutGrossAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td c="dimmed" pl="lg">− Destination PSP Fee (Deducted)</Table.Td>
                            <Table.Td ta="right" c="dimmed">{fee.destinationCurrency} {safeNumber(fee.destinationPspFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}>
                            <Table.Td fw={600}>= Recipient Receives (Net)</Table.Td>
                            <Table.Td ta="right" fw={600}>{fee.destinationCurrency} {safeNumber(fee.recipientNetAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>

                {/* Exchange Rates with explicit units */}
                <Stack gap="xs" p="md" bg="var(--mantine-color-dark-7)" style={{ borderRadius: "8px" }}>
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Text size="sm" fw={700}>Market FX Rate (Mid)</Text>
                            <Text size="xs" c="dimmed">Before spread applied</Text>
                        </Stack>
                        <Text size="lg" fw={700} c="blue">
                            1 {fee.sourceCurrency} = {safeNumber(fee.marketRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {fee.destinationCurrency}
                        </Text>
                    </Group>
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Text size="sm" c="dimmed">Customer Rate (After {fee.appliedSpreadBps} bps spread)</Text>
                            <Text size="xs" c="dimmed">Rate used for FX conversion</Text>
                        </Stack>
                        <Text size="sm" c="cyan" fw={500}>
                            1 {fee.sourceCurrency} = {safeNumber(fee.customerRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {fee.destinationCurrency}
                        </Text>
                    </Group>
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Text size="sm" c="dimmed">Effective Rate (All-In)</Text>
                            <Text size="xs" c="dimmed">Recipient receives ÷ Sender pays</Text>
                        </Stack>
                        <Text size="sm" c="orange" fw={500}>
                            1 {fee.sourceCurrency} = {safeNumber(fee.effectiveRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {fee.destinationCurrency}
                        </Text>
                    </Group>
                    {quote && (
                        <Badge color="blue" variant="dot" size="lg" fullWidth mt="sm">
                            Quote locked for next {Math.max(0, Math.floor((new Date(quote.expiresAt.replace(/\+00:00Z$/, 'Z')).getTime() - now) / 1000))}s
                        </Badge>
                    )}
                </Stack>
            </Stack>
        </Card>
    );
}

// Lifecycle accordion component
function LifecycleAccordion({
    stepsByPhase,
    getStepIcon,
    getStepColor,
    feeBreakdown,
    resolution,
    intermediaries,
}: {
    stepsByPhase: { phase: number; name: string; steps: LifecycleStep[] }[];
    getStepIcon: (status: LifecycleStep["status"]) => React.ReactNode;
    getStepColor: (status: LifecycleStep["status"]) => string;
    feeBreakdown: FeeBreakdown | null;
    resolution: ProxyResolutionResult | null;
    intermediaries: IntermediaryAgentsResponse | null;
}) {
    return (
        <Accordion defaultValue={["1", "2"]} multiple>
            {stepsByPhase.map(({ phase, name, steps }) => {
                const completedCount = steps.filter((s) => s.status === "completed").length;
                const hasActive = steps.some((s) => s.status === "active");
                return (
                    <Accordion.Item key={phase} value={String(phase)}>
                        <Accordion.Control>
                            <Group justify="space-between">
                                <Text size="sm" fw={500}>Phase {phase}: {name}</Text>
                                <Badge size="sm" color={completedCount === steps.length ? "green" : hasActive ? "blue" : "gray"}>
                                    {completedCount}/{steps.length}
                                </Badge>
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Timeline active={steps.findIndex((s) => s.status === "active")} bulletSize={20} lineWidth={2}>
                                {steps.map((step) => (
                                    <Timeline.Item
                                        key={step.id}
                                        bullet={getStepIcon(step.status)}
                                        color={getStepColor(step.status)}
                                        title={
                                            <Group justify="space-between" align="center" style={{ width: "100%" }}>
                                                <Group gap="xs">
                                                    <Text size="sm" fw={700}>{step.id}. {step.name}</Text>
                                                    {step.isoMessage !== "-" && (
                                                        <Badge size="xs" variant="outline">{step.isoMessage}</Badge>
                                                    )}
                                                </Group>
                                                <Text size="xs" c="dimmed" fs="italic">{step.apiCall}</Text>
                                            </Group>
                                        }
                                    >
                                        {/* Step-specific details */}
                                        {step.id === 6 && feeBreakdown && (
                                            <Box mt={4} p="xs" bg="var(--mantine-color-dark-6)" style={{ borderRadius: "4px" }}>
                                                <Text size="xs">Rate: {feeBreakdown.marketRate} • Total Debit: {feeBreakdown.sourceCurrency} {feeBreakdown.senderTotal}</Text>
                                            </Box>
                                        )}
                                        {step.id === 8 && resolution && (
                                            <Box mt={4} p="xs" bg="var(--mantine-color-dark-6)" style={{ borderRadius: "4px" }}>
                                                <Text size="xs" fw={700} c="green">Resolved: {resolution.beneficiaryName || resolution.accountName}</Text>
                                                <Text size="xs">Bank: {resolution.agentBic || resolution.bankName || "Unknown"}</Text>
                                            </Box>
                                        )}
                                        {step.id === 13 && intermediaries && (
                                            <Box mt={4} p="xs" bg="var(--mantine-color-dark-6)" style={{ borderRadius: "4px" }}>
                                                <Stack gap={4}>
                                                    <Group justify="space-between">
                                                        <Text size="xs" fw={700} c="blue">Source SAP (IntermediaryAgent1)</Text>
                                                        <Text size="xs">{intermediaries.intermediaryAgent1.bic}</Text>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">Acc: {intermediaries.intermediaryAgent1.accountNumber}</Text>
                                                    <Group justify="space-between">
                                                        <Text size="xs" fw={700} c="green">Dest SAP (IntermediaryAgent2)</Text>
                                                        <Text size="xs">{intermediaries.intermediaryAgent2.bic}</Text>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">Acc: {intermediaries.intermediaryAgent2.accountNumber}</Text>
                                                </Stack>
                                            </Box>
                                        )}
                                        {step.id === 17 && step.status === "completed" && (
                                            <Text size="xs" c="green" fw={700} mt={4}>ACCC: Settlement Confirmed</Text>
                                        )}
                                    </Timeline.Item>
                                ))}
                            </Timeline>
                        </Accordion.Panel>
                    </Accordion.Item>
                );
            })}
        </Accordion>
    );
}
