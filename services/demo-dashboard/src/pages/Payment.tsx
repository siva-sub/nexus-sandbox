import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { generateUUID } from "../utils/uuid";
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
    Autocomplete,
    Badge,
    Table,
    Box,
    Alert,
    Tabs,

    NumberInput,
    Anchor,
    Breadcrumbs,
    Switch,
    Collapse,
    Code,
    ActionIcon,
    CopyButton,
    Checkbox,
    Tooltip,
    Divider,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconSend,
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
    IconShieldCheck,
} from "@tabler/icons-react";
import type { Country, Quote, FeeBreakdown, ProxyResolutionResult, IntermediaryAgentsResponse } from "../types";
import {
    getCountries,
    getQuotes,
    getAddressTypes,
    resolveProxy,
    searchProxies,
    getPreTransactionDisclosure,
    parseQRCode,
    submitPacs008
} from "../services/api";
import { usePaymentLifecycle } from "../hooks/payment";
import type { LifecycleStep } from "../hooks/payment";
import { FeeCard, LifecycleAccordion } from "../components/payment";

// 17-Step Lifecycle now managed by usePaymentLifecycle hook
// FeeCard and LifecycleAccordion extracted to components/payment/

export function PaymentPage() {
    const [searchParams] = useSearchParams();
    const demoCode = searchParams.get("demo");

    // Form state
    const [amount, setAmount] = useState<number | string>(1000);
    const [amountType, setAmountType] = useState<"SOURCE" | "DESTINATION">("SOURCE");
    const [sourceCountry, setSourceCountry] = useState<string | null>("SG"); // Default to Singapore
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null); // Destination country
    const [selectedProxyType, setSelectedProxyType] = useState<string | null>(null);
    const [recipientData, setRecipientData] = useState<Record<string, string>>({});
    const [uetr, _setUetr] = useState<string>(generateUUID());
    // Nexus spec compliance: Instruction Priority (HIGH=25s, NORM=4hr)
    const [instructionPriority, setInstructionPriority] = useState<"HIGH" | "NORM">("NORM");
    // Step 12: Payment Reference (sender message to recipient)
    const [paymentReference, setPaymentReference] = useState<string>("");
    // Confirmation of Payee
    const [recipientConfirmed, setRecipientConfirmed] = useState<boolean>(false);
    // Step 10-11: Sanctions Screening Data (FATF R16)
    const [sanctionsData, setSanctionsData] = useState<{
        recipientAddress: string;
        recipientDateOfBirth: string;
        recipientNationalId: string;
    }>({
        recipientAddress: "",
        recipientDateOfBirth: "",
        recipientNationalId: "",
    });


    // Step 7: Fee Type (INVOICED/DEDUCTED) - Phase 2 implementation
    const [sourceFeeType, setSourceFeeType] = useState<"INVOICED" | "DEDUCTED">("INVOICED");

    // Data state
    const [countries, setCountries] = useState<Country[]>([]);
    const [proxyTypes, setProxyTypes] = useState<import("../types").AddressTypeWithInputs[]>([]);
    const [proxySuggestions, setProxySuggestions] = useState<string[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
    const [resolution, setResolution] = useState<ProxyResolutionResult | null>(null);
    const [recipientErrors, setRecipientErrors] = useState<Record<string, string | null>>({});
    const [intermediaries, setIntermediaries] = useState<IntermediaryAgentsResponse | null>(null);

    // Consume demo trigger
    useEffect(() => {
        const triggerStr = sessionStorage.getItem("demoTrigger");
        if (triggerStr && demoCode) {
            try {
                const trigger = JSON.parse(triggerStr);
                if (trigger.code === demoCode) {
                    // Logic to auto-fill based on trigger
                    if (demoCode === 'AM04') setAmount(99999);
                    if (demoCode === 'AM02') setAmount(50001);
                    if (demoCode === 'BE23') {
                        setSelectedCountry('TH');
                        setRecipientData({ 'accountOrProxyId': '+66999999999' });
                        setSelectedProxyType('MOBI');
                    }
                    if (demoCode === 'AC04') {
                        setSelectedCountry('MY');
                        setRecipientData({ 'accountOrProxyId': '+60999999999' });
                        setSelectedProxyType('MOBI');
                    }
                    if (demoCode === 'RR04') {
                        setSelectedCountry('ID');
                        setRecipientData({ 'accountOrProxyId': '+62999999999' });
                        setSelectedProxyType('MOBI');
                    }

                    notifications.show({
                        title: "Demo Auto-Populated",
                        message: `Setup for ${demoCode} scenario applied.`,
                        color: "blue"
                    });
                }
            } catch (e) {
                console.error("Failed to consume demo trigger", e);
            }
        }
    }, [demoCode, countries]); // Wait for countries to load before setting selectedCountry




    // Lifecycle state - using extracted hook
    const { stepsByPhase, advanceStep, setSteps } = usePaymentLifecycle();

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
                        const sCountry = countries.find(c => c.countryCode === (sourceCountry || "SG"));
                        const dCountry = countries.find(c => c.countryCode === selectedCountry);

                        if (sCountry && dCountry) {
                            const sourceCcy = sCountry.currencies[0].currencyCode;
                            const destCcy = dCountry.currencies[0].currencyCode;

                            const data = await getQuotes(
                                sourceCountry || "SG",
                                sourceCcy,
                                selectedCountry,
                                destCcy,
                                Number(amount),
                                amountType
                            );
                            setQuotes(data.quotes);

                            // NEXUS SPEC COMPLIANCE: PSP auto-selects best quote
                            // Per docs: "The PSP does not need to show the list of quotes to the Sender"
                            // Auto-select the quote with best rate (highest when sending, lowest when receiving)
                            if (data.quotes && data.quotes.length > 0) {
                                const sortedQuotes = [...data.quotes].sort((a, b) => {
                                    if (amountType === "SOURCE") {
                                        // When sending fixed amount, maximize recipient amount
                                        return Number(b.creditorAccountAmount || 0) - Number(a.creditorAccountAmount || 0);
                                    } else {
                                        // When receiving fixed amount, minimize sender cost
                                        return Number(a.sourceInterbankAmount || 0) - Number(b.sourceInterbankAmount || 0);
                                    }
                                });

                                // Auto-select the best quote (PSP selection, not user selection)
                                const bestQuote = sortedQuotes[0];
                                setSelectedQuote(bestQuote);

                                // Fetch fee breakdown for selected quote
                                try {
                                    const fees = await getPreTransactionDisclosure(bestQuote.quoteId, sourceFeeType);
                                    setFeeBreakdown(fees);
                                } catch {
                                    // Fee fetch failed, continue without breakdown
                                }
                            }
                        }
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
                            const sCountry = countries.find(c => c.countryCode === (sourceCountry || "SG"));
                            const dCountry = countries.find(c => c.countryCode === selectedCountry);
                            const sourceCcy = sCountry?.currencies[0]?.currencyCode || "SGD";
                            const destCcy = dCountry?.currencies[0]?.currencyCode || "THB";

                            const quotesData = await getQuotes(
                                sourceCountry || "SG",
                                sourceCcy,
                                selectedCountry,
                                destCcy,
                                Number(amount),
                                amountType
                            );
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

    // advanceStep is now provided by usePaymentLifecycle hook

    const handleResolve = async () => {
        const typeData = proxyTypes.find(t => t.value === selectedProxyType);
        // Only validate visible (non-hidden) required fields
        const visibleInputs = typeData?.inputs?.filter((i: import("../types").AddressTypeInputDetails) => !i.attributes?.hidden) || [];
        const requiredFields = visibleInputs.map((i: import("../types").AddressTypeInputDetails) => i.attributes.name);
        const hasAllFields = requiredFields.length === 0 || requiredFields.every((f) => !!recipientData[f]);

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
            const result = await resolveProxy({
                sourceCountry: sourceCountry || 'SG',
                destinationCountry: selectedCountry,
                proxyType: selectedProxyType,
                proxyValue: primaryValue,
                structuredData: recipientData
            });
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

            // ISO 20022 Error Code mapping (all 12 codes)
            const errorCodeDescriptions: Record<string, string> = {
                // Account/Proxy Errors
                'BE23': 'Account/Proxy Invalid - Not registered in destination country PDO',
                'AC01': 'Incorrect Account Number - Invalid format',
                'AC04': 'Account Closed - Recipient account has been closed',
                'AC06': 'Account Inactive - Recipient account is dormant',
                'AB08': 'Creditor Agent Unavailable - Destination PSP offline',

                // Transaction Errors
                'AB04': 'Quote Expired - Exchange rate no longer valid (quote valid for 10 minutes)',
                'AM04': 'Insufficient Funds - FXP or SAP lacks liquidity for this transaction',
                'AM02': 'Amount Limit Exceeded - Transaction exceeds maximum allowed amount',

                // Regulatory/Compliance Errors
                'RR04': 'Regulatory Block - AML/CFT sanctions screening failed',

                // Agent Errors
                'AGNT': 'Incorrect Agent - PSP not onboarded to Nexus',
                'RC01': 'Intermediary Agent Missing - Required routing agent not found',

                // General Errors
                'DUPL': 'Duplicate Payment - A payment with this UETR already exists',
                'FF01': 'Format Error - Message does not conform to XSD schema',
                'CH21': 'Mandatory Element Missing - Required field is missing or invalid',
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
                // Map QR proxy types to address type IDs
                const qrProxyToAddressType: Record<string, string> = {
                    'MBNO': 'MOBI', 'MOBILE': 'MOBI', 'NIDN': 'NIDN',
                    'UEN': 'UEN', 'ACCT': 'ACCT', 'VPA': 'MOBI',
                };
                setSelectedProxyType(qrProxyToAddressType[result.merchantAccountInfo.proxyType] || result.merchantAccountInfo.proxyType);
            }
            if (result.merchantAccountInfo.proxyValue) {
                // Always use 'accountOrProxyId' as the key — matches backend input field name
                setRecipientData(prev => ({ ...prev, accountOrProxyId: result.merchantAccountInfo.proxyValue || '' }));
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



    const handleSubmit = async () => {
        if (!selectedQuote) {
            notifications.show({ title: "Error", message: "Please select a quote first", color: "red" });
            return;
        }

        // Nexus spec compliance: Explicit Confirmation of Payee required
        if (!recipientConfirmed) {
            notifications.show({
                title: "Confirmation Required",
                message: "Please confirm the recipient name before sending",
                color: "yellow"
            });
            return;
        }

        setLoading((prev) => ({ ...prev, submit: true }));

        try {
            // Step 14: Construct message
            advanceStep(14);

            // Step 15: Submit to IPS
            advanceStep(15);

            // Determine clearing system codes based on source country
            const clearingSystemCodes: Record<string, string> = {
                'SG': 'SGFAST',
                'TH': 'THBRT',
                'MY': 'MYDUIT',
                'PH': 'PHINST',
                'ID': 'IDQRIS',
                'IN': 'INUPI'
            };

            const params = {
                uetr,
                quoteId: selectedQuote.quoteId,
                sourceAmount: Number(amount),
                sourceCurrency: feeBreakdown?.sourceCurrency || "SGD",
                destinationAmount: Number(selectedQuote.destinationInterbankAmount),
                destinationCurrency: selectedCountryData?.currencies[0]?.currencyCode || "THB",
                exchangeRate: Number(selectedQuote.exchangeRate),
                debtorName: "Demo Sender",
                debtorAccount: "DEMO-SENDER-ACCT",
                debtorAgentBic: "DBSSSGSG", // Default source agent
                creditorName: resolution?.beneficiaryName || "Demo Recipient",
                creditorAccount: resolution?.accountNumber || "DEMO-RECIPIENT-ACCT",
                creditorAgentBic: resolution?.agentBic || "MOCKTHBK",
                // Nexus spec mandatory fields
                acceptanceDateTime: new Date().toISOString(),
                instructionPriority,
                clearingSystemCode: clearingSystemCodes[sourceCountry || "SG"],
                intermediaryAgent1Bic: intermediaries?.intermediaryAgent1?.bic,
                intermediaryAgent2Bic: intermediaries?.intermediaryAgent2?.bic,
                paymentReference: paymentReference || undefined,
                scenarioCode: demoCode || undefined
            };

            const result = await submitPacs008(params);

            // Step 16: Settlement Chain
            advanceStep(16);
            await new Promise(r => setTimeout(r, 800));

            // Step 17: Completion
            advanceStep(17);
            advanceStep(18); // Checkmark for visual finish

            notifications.show({
                title: "Payment Successful",
                message: `Transaction ${result.uetr} completed (ACCC)`,
                color: "green",
                icon: <IconCheck size={16} />
            });
        } catch (err) {
            // Handle rejection (unhappy flows)
            console.error('[Payment] Submit failed:', err);
            const error = err as Error & { statusReasonCode?: string; errors?: string[]; detail?: string };
            const statusCode = error.statusReasonCode || 'RJCT';
            const description = error.errors?.[0] || error.detail || 'Payment failed';

            // Mark step 15 as error
            setSteps(prev => prev.map(s => ({
                ...s,
                status: s.id === 15 ? 'error' : s.status
            })));

            notifications.show({
                title: `Payment Rejected (${statusCode})`,
                message: description,
                color: "red",
                icon: <IconAlertCircle size={16} />,
                autoClose: false
            });
        } finally {
            setLoading((prev) => ({ ...prev, submit: false }));
        }
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

    // stepsByPhase is now provided by usePaymentLifecycle hook

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
                        <Card withBorder radius="md" p="xl" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
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
                                    max={amountType === "SOURCE"
                                        ? Number(countries.find(c => c.countryCode === sourceCountry)?.currencies?.[0]?.maxAmount || 999999999)
                                        : Number(selectedCountryData?.currencies?.[0]?.maxAmount || 999999999)}
                                    thousandSeparator=","
                                    description={amountType === "SOURCE"
                                        ? `System will calculate how much recipient receives. Maximum: ${countries.find(c => c.countryCode === sourceCountry)?.currencies?.[0]?.maxAmount?.toLocaleString() || "N/A"} ${countries.find(c => c.countryCode === sourceCountry)?.currencies?.[0]?.currencyCode || ""}`
                                        : `System will calculate how much to debit from your account. Maximum: ${selectedCountryData?.currencies?.[0]?.maxAmount?.toLocaleString() || "N/A"} ${selectedCountryData?.currencies?.[0]?.currencyCode || ""}`}
                                />

                                {/* NEXUS SPEC COMPLIANCE: Instruction Priority Selection */}
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" fw={500}>Instruction Priority</Text>
                                        <Tooltip
                                            label={
                                                <Stack gap={4} p="xs">
                                                    <Text size="xs" fw={500}>HIGH: 25 second timeout</Text>
                                                    <Text size="xs" fw={500}>NORMAL: 4 hour timeout</Text>
                                                    <Text size="xs" c="dimmed">Per Nexus ISO 20022 spec</Text>
                                                </Stack>
                                            }
                                            multiline
                                            w={250}
                                        >
                                            <IconInfoCircle size={16} color="var(--mantine-color-dimmed)" />
                                        </Tooltip>
                                    </Group>
                                    <SegmentedControl
                                        value={instructionPriority}
                                        onChange={(val) => setInstructionPriority(val as "HIGH" | "NORM")}
                                        data={[
                                            { value: "NORM", label: "Normal (4hr)" },
                                            { value: "HIGH", label: "High (25s)" },
                                        ]}
                                        size="sm"
                                    />
                                    <Text size="xs" c="dimmed">
                                        {instructionPriority === "HIGH"
                                            ? "Payment must complete within 25 seconds or be rejected"
                                            : "Payment has up to 4 hours to complete"}
                                    </Text>
                                </Stack>
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
                                {proxyTypes.find(t => t.value === selectedProxyType)?.inputs?.map((input: import("../types").AddressTypeInputDetails) => {
                                    const isProxyField = input.attributes.name === "accountOrProxyId";
                                    const isHidden = input.attributes?.hidden;

                                    if (isHidden) return null;

                                    if (isProxyField) {
                                        return (
                                            <Autocomplete
                                                key={input.attributes.name}
                                                label={input.label?.title?.en || input.label?.code || (input as any).displayLabel || 'Value'}
                                                placeholder={input.attributes?.placeholder || "Type to search contacts..."}
                                                value={recipientData[input.attributes.name] || ""}
                                                data={proxySuggestions}
                                                error={recipientErrors[input.attributes.name]}
                                                onOptionSubmit={(val) => {
                                                    // Auto-resolve when user selects from autocomplete dropdown
                                                    const cleanVal = val.includes(" — ") ? val.split(" — ")[0] : val;
                                                    setRecipientData(prev => ({ ...prev, [input.attributes.name]: cleanVal }));
                                                    // Trigger resolve after a short delay to let state update
                                                    setTimeout(() => handleResolve(), 100);
                                                }}
                                                onKeyDown={(e) => {
                                                    // Auto-resolve when user presses Enter
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleResolve();
                                                    }
                                                }}
                                                onChange={(val) => {
                                                    // Auto-clean: if value contains em dash from option selection, extract pure proxy value
                                                    const cleanVal = val.includes(" — ") ? val.split(" — ")[0] : val;
                                                    setRecipientData(prev => ({ ...prev, [input.attributes.name]: cleanVal }));
                                                    // Search for matching proxies
                                                    if (cleanVal.length >= 2 && selectedCountry && selectedProxyType) {
                                                        searchProxies({ countryCode: selectedCountry, proxyType: selectedProxyType, q: cleanVal })
                                                            .then(res => setProxySuggestions(
                                                                res.results.map(r => `${r.proxyValue} — ${r.displayName}`)
                                                            ))
                                                            .catch(() => setProxySuggestions([]));
                                                    } else {
                                                        setProxySuggestions([]);
                                                    }
                                                    // Validate against backend regex
                                                    const pattern = input.attributes?.pattern;
                                                    if (pattern && cleanVal) {
                                                        const regex = new RegExp(pattern);
                                                        if (!regex.test(cleanVal)) {
                                                            setRecipientErrors(prev => ({ ...prev, [input.attributes.name]: `Invalid format. Expected: ${input.attributes?.placeholder || "correct format"}` }));
                                                        } else {
                                                            setRecipientErrors(prev => ({ ...prev, [input.attributes.name]: null }));
                                                        }
                                                    } else {
                                                        setRecipientErrors(prev => ({ ...prev, [input.attributes.name]: null }));
                                                    }
                                                }}
                                                disabled={!selectedProxyType}
                                                rightSection={
                                                    input === proxyTypes.find(t => t.value === selectedProxyType)?.inputs?.[0] && (
                                                        <Button
                                                            size="compact-xs"
                                                            variant="light"
                                                            onClick={handleResolve}
                                                            loading={loading.resolve}
                                                            disabled={!Object.values(recipientData).some(v => v) || Object.values(recipientErrors).some(e => e)}
                                                        >
                                                            Resolve
                                                        </Button>
                                                    )
                                                }
                                                rightSectionWidth={80}
                                            />
                                        );
                                    }

                                    return (
                                        <TextInput
                                            key={input.attributes.name}
                                            label={input.label?.title?.en || input.label?.code || (input as any).displayLabel || 'Value'}
                                            placeholder={input.attributes?.placeholder || ""}
                                            value={recipientData[input.attributes.name] || ""}
                                            error={recipientErrors[input.attributes.name]}
                                            onChange={(e) => {
                                                const val = e.currentTarget.value;
                                                setRecipientData(prev => ({ ...prev, [input.attributes.name]: val }));
                                                const pattern = input.attributes?.pattern;
                                                if (pattern && val) {
                                                    const regex = new RegExp(pattern);
                                                    if (!regex.test(val)) {
                                                        setRecipientErrors(prev => ({ ...prev, [input.attributes.name]: `Invalid format. Expected: ${input.attributes?.placeholder || "correct format"}` }));
                                                    } else {
                                                        setRecipientErrors(prev => ({ ...prev, [input.attributes.name]: null }));
                                                    }
                                                } else {
                                                    setRecipientErrors(prev => ({ ...prev, [input.attributes.name]: null }));
                                                }
                                            }}
                                            disabled={!selectedProxyType}
                                        />
                                    );
                                })}


                                {resolution && resolution.verified && (
                                    <>
                                        <Alert color="green" title="Recipient Verified" icon={<IconCheck size={16} />} p="xs">
                                            <Stack gap={4}>
                                                <Text size="xs" fw={700}>Name: {resolution.beneficiaryName || resolution.accountName}</Text>
                                                <Text size="xs">A/C: {resolution.accountNumber}</Text>
                                                <Text size="xs">Bank/BIC: {resolution.agentBic || resolution.bankName}</Text>
                                            </Stack>
                                        </Alert>

                                        {/* FATF R16: Sanctions Screening Data Collection (Step 10-11) */}
                                        <Card withBorder p="sm" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                                            <Group gap="xs" mb="xs">
                                                <IconShieldCheck size={16} color="var(--mantine-color-blue-filled)" />
                                                <Text size="sm" fw={500}>Sanctions Screening (FATF R16)</Text>
                                                <Tooltip
                                                    label={
                                                        <Stack gap={4} p="xs">
                                                            <Text size="xs" fw={700}>PSP Responsibility</Text>
                                                            <Text size="xs">In production, the Source PSP screens all payments against sanctions lists applicable in its jurisdiction.</Text>
                                                            <Text size="xs" mt={4}>Per FATF Recommendation 16 (Wire Transfers), the PSP must collect:</Text>
                                                            <Text size="xs">• Recipient Name (mandatory, from proxy resolution)</Text>
                                                            <Text size="xs">• Account Number (mandatory)</Text>
                                                            <Text size="xs">• PLUS at least one of: Address, Date of Birth, or National ID</Text>
                                                            <Text size="xs" mt={4} c="dimmed">This data helps reduce false positives during sanctions screening.</Text>
                                                        </Stack>
                                                    }
                                                    multiline
                                                    w={340}
                                                >
                                                    <IconInfoCircle size={14} color="var(--mantine-color-dimmed)" />
                                                </Tooltip>
                                            </Group>
                                            <Divider mb="xs" />
                                            <Stack gap="xs">
                                                <TextInput
                                                    label="Recipient Address"
                                                    placeholder="Street address, city, country"
                                                    value={sanctionsData.recipientAddress}
                                                    onChange={(e) => {
                                                        setSanctionsData(prev => ({ ...prev, recipientAddress: e.target.value }));
                                                        advanceStep(10); // Sanctions check step
                                                    }}
                                                    description="Required if DOB and National ID not provided"
                                                />
                                                <Group grow>
                                                    <TextInput
                                                        label="Date of Birth"
                                                        placeholder="YYYY-MM-DD"
                                                        value={sanctionsData.recipientDateOfBirth}
                                                        onChange={(e) => {
                                                            setSanctionsData(prev => ({ ...prev, recipientDateOfBirth: e.target.value }));
                                                            advanceStep(10);
                                                        }}
                                                        description="Optional"
                                                    />
                                                    <TextInput
                                                        label="National ID"
                                                        placeholder="Passport/NRIC/etc"
                                                        value={sanctionsData.recipientNationalId}
                                                        onChange={(e) => {
                                                            setSanctionsData(prev => ({ ...prev, recipientNationalId: e.target.value }));
                                                            advanceStep(10);
                                                        }}
                                                        description="Optional"
                                                    />
                                                </Group>
                                                {(sanctionsData.recipientAddress || sanctionsData.recipientDateOfBirth || sanctionsData.recipientNationalId) && (
                                                    <Alert color="green" variant="light" p="xs" mt="xs">
                                                        <Group gap="xs">
                                                            <IconCheck size={14} />
                                                            <Text size="xs">FATF R16 requirement satisfied</Text>
                                                        </Group>
                                                    </Alert>
                                                )}
                                            </Stack>
                                        </Card>

                                        {/* NEXUS SPEC COMPLIANCE: Explicit Confirmation of Payee (Step 11) */}
                                        <Card withBorder p="xs" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                                            <Checkbox
                                                label={
                                                    <Stack gap={0}>
                                                        <Text size="sm" fw={500}>I confirm this is the intended recipient</Text>
                                                        <Text size="xs" c="dimmed">
                                                            You are sending to: <strong>{resolution.beneficiaryName || resolution.accountName}</strong>
                                                        </Text>
                                                    </Stack>
                                                }
                                                checked={recipientConfirmed}
                                                onChange={(e) => setRecipientConfirmed(e.currentTarget.checked)}
                                                color="green"
                                                required
                                            />
                                        </Card>
                                    </>
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
                                {/* Payment Reference (Step 12) */}
                                <TextInput
                                    label="Payment Reference (Optional)"
                                    placeholder="Enter a message for the recipient (max 140 characters)"
                                    value={paymentReference}
                                    onChange={(e) => setPaymentReference(e.currentTarget.value.slice(0, 140))}
                                    maxLength={140}
                                    description="This message will appear on the recipient's statement"
                                    leftSection={<IconReceipt size={16} />}
                                />

                                <Button
                                    fullWidth
                                    leftSection={<IconSend size={16} />}
                                    loading={loading.submit}
                                    disabled={!selectedQuote || !resolution || !resolution.verified || !recipientConfirmed}
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
                                {selectedQuote ? (
                                    // NEXUS SPEC COMPLIANCE: Show auto-selected quote (PSP selected, not user selected)
                                    // Per docs: "The PSP does not need to show the list of quotes to the Sender"
                                    <Card withBorder radius="md" p="md" style={{ borderColor: "var(--mantine-color-green-filled)" }}>
                                        <Stack gap="xs">
                                            <Group justify="space-between" align="flex-start">
                                                <Box>
                                                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                                        Selected Quote (Best Rate)
                                                    </Text>
                                                    {selectedQuote.creditorAccountAmount ? (
                                                        <>
                                                            <Text fw={700} size="xl" c="green">
                                                                {selectedCountryData?.currencies[0]?.currencyCode} {Number(selectedQuote.creditorAccountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </Text>
                                                            <Text size="sm" c="dimmed">
                                                                Net to recipient after fees
                                                            </Text>
                                                        </>
                                                    ) : (
                                                        <Text fw={700} size="xl">
                                                            {selectedCountryData?.currencies[0]?.currencyCode} {selectedQuote.destinationInterbankAmount}
                                                        </Text>
                                                    )}
                                                </Box>
                                                <Stack gap={2} align="flex-end">
                                                    <Badge size="sm" color="green" variant="filled">
                                                        Best Rate Selected
                                                    </Badge>
                                                    {(() => {
                                                        const expiresAt = new Date(selectedQuote.expiresAt).getTime();
                                                        const remainingSecs = Math.max(0, Math.floor((expiresAt - now) / 1000));
                                                        const isWarning = remainingSecs <= 60;
                                                        const isCritical = remainingSecs <= 30;

                                                        return (
                                                            <>
                                                                <Text
                                                                    size="xs"
                                                                    c={isCritical ? "red" : isWarning ? "orange" : "dimmed"}
                                                                    fw={isWarning ? 600 : 400}
                                                                >
                                                                    Expires in: {remainingSecs > 60
                                                                        ? `${Math.floor(remainingSecs / 60)}m ${remainingSecs % 60}s`
                                                                        : `${remainingSecs}s`}
                                                                    {isCritical && " ⚠️"}
                                                                </Text>
                                                            </>
                                                        );
                                                    })()}
                                                </Stack>
                                            </Group>

                                            <Divider />

                                            <Group justify="space-between">
                                                <Stack gap={0}>
                                                    <Text size="xs" c="dimmed">FX Provider</Text>
                                                    <Text size="sm" fw={500}>{selectedQuote.fxpName}</Text>
                                                </Stack>
                                                <Stack gap={0} align="flex-end">
                                                    <Text size="xs" c="dimmed">Exchange Rate</Text>
                                                    <Text size="sm" fw={500}>1 {selectedQuote.sourceCurrency} = {Number(selectedQuote.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedCountryData?.currencies[0]?.currencyCode}</Text>
                                                </Stack>
                                            </Group>

                                            {quotes.length > 1 && (
                                                <Text size="xs" c="dimmed" ta="center" mt="xs">
                                                    {quotes.length} quotes compared • Best rate auto-selected by PSP
                                                </Text>
                                            )}
                                        </Stack>
                                    </Card>
                                ) : quotes.length > 0 ? (
                                    <Alert icon={<IconAlertCircle size={16} />} title="Quote Selection" color="blue">
                                        Selecting best quote from {quotes.length} FX providers...
                                    </Alert>
                                ) : (
                                    <Alert icon={<IconAlertCircle size={16} />} title="Quoting" color="blue">
                                        Select a destination country to retrieve live multi-provider quotes via Nexus FXP Aggregation.
                                    </Alert>
                                )}
                                {/* Fee Type Selector - Phase 2 Implementation */}
                                {feeBreakdown && (
                                    <>
                                        <Card withBorder p="xs">
                                            <Group justify="space-between" align="center">
                                                <Text size="sm" fw={500}>Fee Payment Method</Text>
                                                <SegmentedControl
                                                    size="xs"
                                                    value={sourceFeeType}
                                                    onChange={(value) => {
                                                        setSourceFeeType(value as "INVOICED" | "DEDUCTED");
                                                        // Refetch fees with new type
                                                        if (selectedQuote) {
                                                            getPreTransactionDisclosure(selectedQuote.quoteId, value as "INVOICED" | "DEDUCTED")
                                                                .then(fees => setFeeBreakdown(fees))
                                                                .catch(() => notifications.show({
                                                                    title: "Error",
                                                                    message: "Failed to update fee breakdown",
                                                                    color: "red"
                                                                }));
                                                        }
                                                    }}
                                                    data={[
                                                        { label: "Invoiced (Add to total)", value: "INVOICED" },
                                                        { label: "Deducted (From amount)", value: "DEDUCTED" }
                                                    ]}
                                                />
                                            </Group>
                                            <Text size="xs" c="dimmed" mt="xs">
                                                {sourceFeeType === "INVOICED"
                                                    ? "Fee is added on top - you pay the fee separately"
                                                    : "Fee is deducted from transfer amount - recipient receives less"}
                                            </Text>
                                        </Card>
                                        <FeeCard fee={feeBreakdown} quote={selectedQuote} now={now} />
                                    </>
                                )}
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
                <Card withBorder radius="md" p="lg" bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))" mt="lg">
                    <Group justify="space-between" mb="md">
                        <Group gap="xs">
                            <IconCode size={24} color="var(--mantine-color-violet-filled)" />
                            <Title order={4}>Developer Debug Panel</Title>
                        </Group>
                        <Badge color="violet" variant="light">ISO 20022 Message Traces</Badge>
                    </Group>

                    <Stack gap="md">
                        {/* Transaction Tracking IDs */}
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
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
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
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
                        <Card withBorder radius="sm" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
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

// FeeCard and LifecycleAccordion are now imported from ../components/payment
