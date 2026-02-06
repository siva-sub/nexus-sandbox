/**
 * Interactive Demo Page - Full Payment Flow Demo
 * 
 * Follows the actual Nexus reference implementation flow:
 * 1. Source country selection
 * 2. Amount specification (SOURCE or DESTINATION)
 * 3. Destination country + proxy resolution
 * 4. Quote selection from list (Source PSP selects)
 * 5. Confirmation and payment initiation
 * 6. Lifecycle trace display
 * 
 * Validated via NotebookLM query on Feb 4, 2026:
 * - Source PSP requests quotes via GET /quotes
 * - Nexus returns list from pre-submitted FXP rates
 * - Source PSP selects preferred quote
 * - Constructs pacs.008 with Quote ID
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Title,
    Card,
    Stack,
    Group,
    Text,
    Button,
    Select,
    Badge,
    Box,
    SimpleGrid,
    Alert,
    Code,
    Anchor,
    Breadcrumbs,
    useMantineTheme,
    Stepper,
    NumberInput,
    TextInput,
    Radio,
    Progress,
    Timeline,
    Divider,
    Table,
    ScrollArea,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconPlayerPlay,
    IconCheck,
    IconX,
    IconArrowsExchange,
    IconBuildingBank,
    IconServer,
    IconInfoCircle,
    IconRefresh,
    IconSend,
    IconUser,
    IconWorld,
    IconReceipt,
    IconPhone,
    IconAlertTriangle,
    IconCode,
} from "@tabler/icons-react";
import { getCountries, getQuotes, getPreTransactionDisclosure, resolveProxy, submitPacs008 } from "../services/api";
import type { Quote, FeeBreakdown, Country } from "../types";

// ============================================================================
// CONSTANTS
// ============================================================================

// Default PSP BICs by country (for demo fallback when proxy resolution doesn't return BIC)
const DEFAULT_PSP_BIC: Record<string, string> = {
    "SG": "DBSGSGSG",  // DBS Singapore
    "TH": "BKKBTHBK",  // Bangkok Bank Thailand
    "ID": "BMRIIDJA",  // Bank Mandiri Indonesia
    "MY": "MAYBMYKL",  // Maybank Malaysia
    "PH": "BPIKIDJX",  // BPI Philippines
    "IN": "SBININBB",  // SBI India
};

// ============================================================================
// COMPONENT
// ============================================================================

export function InteractiveDemo() {
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
    const navigate = useNavigate();

    // Stepper state
    const [active, setActive] = useState(0);
    const [loading, setLoading] = useState(false);

    // Form state
    const [sourceCountry, setSourceCountry] = useState<string>("SG");
    const [destCountry, setDestCountry] = useState<string>("ID");
    const [amountType, setAmountType] = useState<"SOURCE" | "DESTINATION">("DESTINATION");
    const [amount, setAmount] = useState<number>(100000);
    const [proxyType, setProxyType] = useState<string>("PHONE");
    const [proxyValue, setProxyValue] = useState<string>("+919123456789");
    const [scenario, setScenario] = useState<string>("happy");

    // Demo scenarios - validated via NotebookLM (Feb 4, 2026)
    const SCENARIOS = [
        { value: "happy", label: "✓ ACCC - Happy Flow (Success)", color: "green" },
        { value: "ab04", label: "✗ AB04 - Exchange Rate Mismatch", color: "orange" },
        { value: "tm01", label: "✗ TM01 - Quote Expired", color: "orange" },
        { value: "dupl", label: "✗ DUPL - Duplicate Payment", color: "orange" },
        { value: "am04", label: "✗ AM04 - Insufficient Funds", color: "red" },
        { value: "am02", label: "✗ AM02 - Amount Limit Exceeded", color: "red" },
        { value: "be23", label: "✗ BE23 - Invalid Proxy", color: "red" },
        { value: "ac04", label: "✗ AC04 - Closed Account", color: "red" },
        { value: "rr04", label: "✗ RR04 - Regulatory Block", color: "red" },
    ];

    // Quick Demo handler - runs full flow with preset data in ~5 seconds
    const [quickDemoLoading, setQuickDemoLoading] = useState(false);

    const handleQuickDemo = useCallback(async () => {
        setQuickDemoLoading(true);
        notifications.show({
            id: "quick-demo",
            loading: true,
            title: "Quick Demo Running",
            message: "Executing 17-step payment flow...",
            autoClose: false,
        });

        try {
            // Step 1-2: Resolve proxy
            setActive(0);
            await new Promise(r => setTimeout(r, 300));
            const res = await resolveProxy("ID", "PHONE", "+6281234567890");
            setResolution({ recipientName: res.beneficiaryName || res.displayName || "Budi Santoso", recipientPsp: res.bankName || "Bank Mandiri" });

            // Step 3-4: Get quotes (SG → ID corridor)
            const quotesRes = await getQuotes("SG", "SGD", "ID", "IDR", 100000, "DESTINATION");
            // Pre-select first quote
            setQuotes(quotesRes.quotes);
            if (quotesRes.quotes.length === 0) {
                throw new Error("No quotes available");
            }

            // Step 5-6: Select best quote
            setActive(1);
            await new Promise(r => setTimeout(r, 500));
            const bestQuote = quotesRes.quotes[0];
            setSelectedQuote(bestQuote);

            // Step 7-9: Get PTD
            const ptdData = await getPreTransactionDisclosure(bestQuote.quoteId);
            setPtd(ptdData);
            setActive(2);
            await new Promise(r => setTimeout(r, 500));

            // Step 10-17: Submit payment
            const uetr = crypto.randomUUID();
            const pacs008Params = {
                uetr,
                quoteId: bestQuote.quoteId,
                exchangeRate: parseFloat(bestQuote.exchangeRate),
                sourceAmount: parseFloat(ptdData.senderPrincipal),
                sourceCurrency: "SGD",
                destinationAmount: 100000,
                destinationCurrency: "IDR",
                debtorName: "Quick Demo Sender",
                debtorAccount: "SG1234567890",
                debtorAgentBic: "DBSGSGSG",
                creditorName: "Budi Santoso",
                creditorAccount: "+6281234567890",
                creditorAgentBic: "BMRIIDJA",
                scenarioCode: scenario !== "happy" ? scenario : undefined,
            };

            const response = await submitPacs008(pacs008Params);
            setPaymentResult({ uetr: response.uetr, status: response.status });
            setActive(3);

            notifications.update({
                id: "quick-demo",
                color: "green",
                title: "Quick Demo Complete!",
                message: `Payment ${response.status === "ACCC" ? "succeeded" : "processed"}: ${response.uetr.substring(0, 8)}...`,
                icon: <IconCheck size={16} />,
                loading: false,
                autoClose: 5000,
            });
        } catch (err) {
            const error = err as Error & {
                statusReasonCode?: string;
                detail?: string;
                uetr?: string;
                errorBody?: { detail?: { uetr?: string; statusReasonCode?: string; errors?: string[] } };
            };

            const rejectionCode = error.statusReasonCode ||
                error.errorBody?.detail?.statusReasonCode ||
                "RJCT";
            const rejectionMessage = error.detail ||
                error.errorBody?.detail?.errors?.[0] ||
                error.message;

            // Show as expected rejection for unhappy scenarios
            if (scenario !== "happy") {
                setPaymentResult({ uetr: error.uetr || crypto.randomUUID(), status: rejectionCode, error: rejectionMessage });
                setActive(3);
                notifications.update({
                    id: "quick-demo",
                    color: "orange",
                    title: `Demo Rejection: ${rejectionCode}`,
                    message: rejectionMessage,
                    icon: <IconX size={16} />,
                    loading: false,
                    autoClose: 5000,
                });
            } else {
                notifications.update({
                    id: "quick-demo",
                    color: "red",
                    title: "Quick Demo Failed",
                    message: err instanceof Error ? err.message : "Failed to complete demo",
                    icon: <IconX size={16} />,
                    loading: false,
                    autoClose: 5000,
                });
            }
        } finally {
            setQuickDemoLoading(false);
        }
    }, [scenario]);

    // API data
    const [countries, setCountries] = useState<Country[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [ptd, setPtd] = useState<FeeBreakdown | null>(null);
    const [resolution, setResolution] = useState<{ recipientName?: string; recipientPsp?: string } | null>(null);
    const [paymentResult, setPaymentResult] = useState<{ uetr: string; status: string; error?: string } | null>(null);

    // Countdown for quote
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Load countries on mount
    useEffect(() => {
        getCountries().then(data => setCountries(data.countries)).catch(console.error);
    }, []);

    const sourceCountryData = countries.find(c => c.countryCode === sourceCountry);
    const destCountryData = countries.find(c => c.countryCode === destCountry);

    // Step handlers
    const handleSearch = useCallback(async () => {
        setLoading(true);
        try {
            // Resolve proxy first
            const res = await resolveProxy(destCountry, proxyType, proxyValue);
            setResolution({ recipientName: res.beneficiaryName || res.displayName || "Demo Recipient", recipientPsp: res.bankName });

            // Then get quotes - use currencies from selected countries
            const sourceCurrency = sourceCountryData?.currencies?.[0]?.currencyCode || "SGD";
            const destCurrency = destCountryData?.currencies?.[0]?.currencyCode || "IDR";
            const quotesRes = await getQuotes(sourceCountry, sourceCurrency, destCountry, destCurrency, amount, amountType);
            setQuotes(quotesRes.quotes);

            if (quotesRes.quotes.length === 0) {
                notifications.show({
                    title: "No Quotes Available",
                    message: "No FXPs have rates for this corridor",
                    color: "orange",
                });
            }

            setActive(1);
        } catch (err: any) {
            // The original instruction was to update handleConfirmPayment, but the code snippet provided
            // clearly targets the catch block of handleSearch based on the dependencies and surrounding code.
            // The `setSteps` function is not defined in this component, so it's removed to maintain
            // syntactical correctness and avoid runtime errors.
            notifications.show({
                title: `Payment Rejected (${err.statusReasonCode || 'RJCT'})`,
                message: err.errors?.[0] || err.detail || 'Payment failed',
                color: "red"
            });
        } finally {
            setLoading(false);
        }
    }, [sourceCountry, destCountry, amount, amountType, proxyType, proxyValue]);

    const handleSelectQuote = useCallback(async (quote: Quote) => {
        setSelectedQuote(quote);
        setLoading(true);
        try {
            const ptdData = await getPreTransactionDisclosure(quote.quoteId);
            setPtd(ptdData);
            setActive(2);
        } catch (err) {
            notifications.show({
                title: "PTD Error",
                message: err instanceof Error ? err.message : "Failed to get disclosure",
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    }, []);

    const handleConfirmPayment = useCallback(async () => {
        if (!selectedQuote || !resolution) return;
        setLoading(true);

        // Generate UETR for the payment
        const uetr = crypto.randomUUID();

        try {
            // Get source country data for currency
            const sourceCountryData = countries.find(c => c.countryCode === sourceCountry);
            const destCountryData = countries.find(c => c.countryCode === destCountry);

            // Get primary currency for each country
            const sourceCurrency = sourceCountryData?.currencies?.[0]?.currencyCode || "SGD";
            const destCurrency = destCountryData?.currencies?.[0]?.currencyCode || "IDR";

            // Parse exchange rate (Quote.exchangeRate is string)
            const exchangeRateNum = parseFloat(selectedQuote.exchangeRate);

            // Build pacs.008 parameters from demo data
            const pacs008Params = {
                uetr,
                quoteId: selectedQuote.quoteId,
                exchangeRate: exchangeRateNum,
                sourceAmount: amountType === "SOURCE" ? amount : (ptd ? parseFloat(ptd.senderPrincipal) : amount / exchangeRateNum),
                sourceCurrency: sourceCurrency,
                destinationAmount: amountType === "DESTINATION" ? amount : (ptd ? parseFloat(ptd.recipientNetAmount) : amount * exchangeRateNum),
                destinationCurrency: destCurrency,
                debtorName: "Demo Sender",
                debtorAccount: "SG1234567890",
                debtorAgentBic: "DBSGSGSG", // DBS Singapore
                creditorName: resolution.recipientName || "Demo Recipient",
                creditorAccount: proxyValue,
                creditorAgentBic: resolution.recipientPsp || DEFAULT_PSP_BIC[destCountry] || "BMRIIDJA",
                scenarioCode: scenario !== "happy" ? scenario : undefined,
            };

            // Submit real pacs.008 to backend
            const response = await submitPacs008(pacs008Params);

            // Success - payment accepted
            setPaymentResult({ uetr: response.uetr, status: response.status });
            notifications.show({
                title: "Payment Submitted",
                message: `UETR: ${response.uetr.substring(0, 8)}... - ${response.message}`,
                color: "green",
                icon: <IconCheck size={16} />,
            });
            setActive(3);

        } catch (err) {
            // Handle rejection from backend
            // The error structure is set by fetchJSON in api.ts:
            // error.status, error.statusReasonCode, error.detail, error.errorBody
            const error = err as Error & {
                status?: number;
                statusReasonCode?: string;
                detail?: string;
                uetr?: string;
                errorBody?: {
                    statusReasonCode?: string;
                    detail?: string;
                    message?: string;
                    uetr?: string;
                };
            };

            // Extract rejection details from error structure
            const rejectionCode = error.statusReasonCode ||
                error.errorBody?.statusReasonCode ||
                "RJCT";
            const rejectionMessage = error.detail ||
                error.errorBody?.detail ||
                error.errorBody?.message ||
                error.message ||
                "Payment rejected";
            const rejectionUetr = error.uetr ||
                error.errorBody?.uetr ||
                uetr;

            // Set payment result to show rejection in stepper
            setPaymentResult({
                uetr: rejectionUetr,
                status: rejectionCode,
                error: rejectionMessage
            });

            notifications.show({
                title: `Payment Rejected: ${rejectionCode}`,
                message: rejectionMessage,
                color: "red",
                icon: <IconX size={16} />,
            });
            setActive(3);
        } finally {
            setLoading(false);
        }
    }, [selectedQuote, resolution, scenario, countries, sourceCountry, destCountry, amountType, amount, ptd, proxyValue]);

    const handleReset = useCallback(() => {
        setActive(0);
        setQuotes([]);
        setSelectedQuote(null);
        setPtd(null);
        setResolution(null);
        setPaymentResult(null);
    }, []);

    // Country options
    const getCountryFlag = (code: string): string => {
        const flags: Record<string, string> = { SG: "🇸🇬", ID: "🇮🇩", TH: "🇹🇭", MY: "🇲🇾", PH: "🇵🇭", IN: "🇮🇳" };
        return flags[code] || "🌐";
    };
    const countryOptions = countries.map(c => ({
        value: c.countryCode,
        label: `${getCountryFlag(c.countryCode)} ${c.countryCode} - ${c.name}`,
    }));

    return (
        <Stack gap="lg">
            {/* Header */}
            <Box>
                <Breadcrumbs separator="→" mb="xs">
                    <Anchor href="/" size="sm" c="dimmed">Home</Anchor>
                    <Text size="sm">Interactive Demo</Text>
                </Breadcrumbs>
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Box>
                        <Title order={2}>Interactive Payment Demo</Title>
                        <Text c="dimmed" size="sm">
                            Step-by-step through the Nexus payment flow with real API calls
                        </Text>
                    </Box>
                    <Group>
                        <Button
                            variant="gradient"
                            gradient={{ from: "blue", to: "cyan" }}
                            leftSection={<IconPlayerPlay size={16} />}
                            loading={quickDemoLoading}
                            onClick={handleQuickDemo}
                        >
                            Quick Demo
                        </Button>
                        <Badge size="lg" variant="light" color="blue" leftSection={<IconPlayerPlay size={14} />}>
                            Live API Mode
                        </Badge>
                    </Group>
                </Group>
            </Box>

            {/* Info Banner */}
            <Alert icon={<IconInfoCircle size={18} />} title="Nexus Reference Flow" color="blue" variant="light">
                <Text size="sm">
                    This demo follows the actual Nexus reference implementation:
                    <strong> Source PSP</strong> requests quotes → <strong>Nexus</strong> returns list from FXP rates →
                    <strong> Source PSP</strong> selects quote → Constructs <Code>pacs.008</Code> with Quote ID.
                </Text>
            </Alert>

            {/* Stepper */}
            <Card withBorder p="xl">
                <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false} size={isMobile ? "xs" : "md"}>
                    {/* Step 1: Input Payment Details */}
                    <Stepper.Step
                        label="Payment Details"
                        description="Source, amount, destination"
                        icon={<IconSend size={18} />}
                    >
                        <Stack gap="lg" mt="xl">
                            <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                                <Select
                                    label="Source Country"
                                    description="Where sender is located"
                                    data={countryOptions}
                                    value={sourceCountry}
                                    onChange={(v) => v && setSourceCountry(v)}
                                    searchable
                                    leftSection={<IconWorld size={16} />}
                                />
                                <Select
                                    label="Destination Country"
                                    description="Where recipient is located"
                                    data={countryOptions}
                                    value={destCountry}
                                    onChange={(v) => v && setDestCountry(v)}
                                    searchable
                                    leftSection={<IconWorld size={16} />}
                                />
                            </SimpleGrid>

                            <Radio.Group
                                label="Amount Specification"
                                description="How the sender specifies the amount"
                                value={amountType}
                                onChange={(v) => setAmountType(v as "SOURCE" | "DESTINATION")}
                            >
                                <Group mt="xs">
                                    <Radio value="SOURCE" label={`Send exact (${sourceCountryData?.currencies[0]?.currencyCode || "SGD"})`} />
                                    <Radio value="DESTINATION" label={`Recipient receives exact (${destCountryData?.currencies[0]?.currencyCode || "IDR"})`} />
                                </Group>
                            </Radio.Group>

                            <NumberInput
                                label="Amount"
                                description={amountType === "SOURCE"
                                    ? `Amount sender pays (${sourceCountryData?.currencies[0]?.currencyCode || "SGD"})`
                                    : `Amount recipient receives (${destCountryData?.currencies[0]?.currencyCode || "IDR"})`
                                }
                                value={amount}
                                onChange={(v) => setAmount(typeof v === "number" ? v : 100000)}
                                min={1}
                                thousandSeparator=","
                                leftSection={<Text size="xs" fw={500}>{amountType === "SOURCE" ? sourceCountryData?.currencies[0]?.currencyCode : destCountryData?.currencies[0]?.currencyCode}</Text>}
                            />

                            <Divider label="Recipient Proxy" labelPosition="center" />

                            <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                                <Select
                                    label="Proxy Type"
                                    data={[
                                        { value: "PHONE", label: "📱 Mobile Number" },
                                        { value: "EMAIL", label: "📧 Email Address" },
                                        { value: "RANDOM_KEY", label: "🔑 Random Key" },
                                    ]}
                                    value={proxyType}
                                    onChange={(v) => v && setProxyType(v)}
                                />
                                <TextInput
                                    label="Proxy Value"
                                    description="Recipient identifier for PDO lookup"
                                    value={proxyValue}
                                    onChange={(e) => setProxyValue(e.target.value)}
                                    placeholder="+919123456789"
                                    leftSection={<IconPhone size={16} />}
                                />
                            </SimpleGrid>

                            <Divider label="Demo Scenario" labelPosition="center" />

                            <Select
                                label="Payment Outcome"
                                description="Select scenario to simulate (happy or rejection)"
                                data={SCENARIOS.map(s => ({ value: s.value, label: s.label }))}
                                value={scenario}
                                onChange={(v) => v && setScenario(v)}
                                leftSection={scenario === "happy" ? <IconCheck size={16} color="green" /> : <IconAlertTriangle size={16} color="orange" />}
                            />

                            <Button
                                size="lg"
                                onClick={handleSearch}
                                loading={loading}
                                leftSection={<IconArrowsExchange size={20} />}
                            >
                                Search & Get Quotes
                            </Button>
                        </Stack>
                    </Stepper.Step>

                    {/* Step 2: Select Quote */}
                    <Stepper.Step
                        label="Select Quote"
                        description="Choose FXP rate"
                        icon={<IconArrowsExchange size={18} />}
                    >
                        <Stack gap="md" mt="xl">
                            {resolution && (
                                <Alert icon={<IconUser size={18} />} color="green" variant="light">
                                    <Text size="sm">
                                        <strong>Recipient Found:</strong> {resolution.recipientName}
                                        {resolution.recipientPsp && ` at ${resolution.recipientPsp}`}
                                    </Text>
                                </Alert>
                            )}

                            <Text fw={600}>Available FX Quotes ({quotes.length})</Text>

                            {quotes.length > 0 ? (
                                <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                                    {quotes.map(quote => {
                                        const expiresAt = new Date(quote.expiresAt).getTime();
                                        const remainingSecs = Math.max(0, Math.floor((expiresAt - now) / 1000));
                                        const progressPct = (remainingSecs / 600) * 100;

                                        return (
                                            <Card
                                                key={quote.quoteId}
                                                withBorder
                                                p="md"
                                                style={{
                                                    cursor: "pointer",
                                                    borderColor: selectedQuote?.quoteId === quote.quoteId
                                                        ? "var(--mantine-color-blue-filled)" : undefined,
                                                }}
                                                onClick={() => handleSelectQuote(quote)}
                                            >
                                                <Group justify="space-between" mb="xs">
                                                    <Text fw={600}>{quote.fxpName}</Text>
                                                    <Badge size="sm" color="blue">Best Rate</Badge>
                                                </Group>
                                                <Text size="lg" fw={700} c="green">
                                                    {destCountryData?.currencies[0]?.currencyCode} {Number(quote.creditorAccountAmount || quote.destinationInterbankAmount).toLocaleString()}
                                                </Text>
                                                <Text size="xs" c="dimmed">Net to recipient</Text>
                                                <Group mt="sm" gap="xs">
                                                    <Text size="xs">Rate: {Number(quote.exchangeRate).toFixed(4)}</Text>
                                                    <Progress value={progressPct} size="xs" w={50} color={remainingSecs < 60 ? "red" : "blue"} />
                                                    <Text size="xs" c={remainingSecs < 60 ? "red" : "dimmed"}>{Math.floor(remainingSecs / 60)}m</Text>
                                                </Group>
                                            </Card>
                                        );
                                    })}
                                </SimpleGrid>
                            ) : (
                                <Alert color="orange">No quotes available for this corridor</Alert>
                            )}
                        </Stack>
                    </Stepper.Step>

                    {/* Step 3: Confirm Payment */}
                    <Stepper.Step
                        label="Confirm"
                        description="Review & send"
                        icon={<IconReceipt size={18} />}
                    >
                        <Stack gap="md" mt="xl">
                            {ptd && (
                                <Card withBorder bg="var(--mantine-color-dark-7)">
                                    <Title order={5} mb="md">Pre-Transaction Disclosure</Title>
                                    <SimpleGrid cols={isMobile ? 1 : 3} spacing="lg">
                                        <Box>
                                            <Text size="xs" c="dimmed">Sender Pays (Total)</Text>
                                            <Text size="xl" fw={700} c="blue">
                                                {ptd.sourceCurrency} {Number(ptd.senderTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </Text>
                                        </Box>
                                        <Box>
                                            <Text size="xs" c="dimmed">Recipient Gets (Net)</Text>
                                            <Text size="xl" fw={700} c="green">
                                                {ptd.destinationCurrency} {Number(ptd.recipientNetAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </Text>
                                        </Box>
                                        <Box>
                                            <Text size="xs" c="dimmed">Total Cost</Text>
                                            <Text size="xl" fw={700} c={Number(ptd.totalCostPercent) <= 3 ? "green" : "orange"}>
                                                {Math.abs(Number(ptd.totalCostPercent)).toFixed(2)}%
                                            </Text>
                                            <Text size="xs" c="dimmed">vs mid-market</Text>
                                        </Box>
                                    </SimpleGrid>

                                    <Divider my="md" />

                                    <Table withColumnBorders={false}>
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Td>Principal (FX Amount)</Table.Td>
                                                <Table.Td ta="right">{ptd.sourceCurrency} {Number(ptd.senderPrincipal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td>Source PSP Fee</Table.Td>
                                                <Table.Td ta="right">{ptd.sourceCurrency} {Number(ptd.sourcePspFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td>Scheme Fee</Table.Td>
                                                <Table.Td ta="right">{ptd.sourceCurrency} {Number(ptd.schemeFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td>Destination PSP Fee</Table.Td>
                                                <Table.Td ta="right">{ptd.destinationCurrency} {Number(ptd.destinationPspFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                </Card>
                            )}

                            {/* Embedded XML Preview */}
                            {selectedQuote && ptd && (
                                <Card withBorder bg="var(--mantine-color-dark-8)" p="md">
                                    <Group justify="space-between" mb="xs">
                                        <Group gap="xs">
                                            <IconCode size={18} color="var(--mantine-color-blue-4)" />
                                            <Text fw={600} size="sm">ISO 20022 pacs.008 Message</Text>
                                        </Group>
                                        <Badge variant="outline" size="xs">Step 10: Initiation</Badge>
                                    </Group>

                                    <Text size="xs" c="dimmed" mb="md">
                                        The Source PSP constructs this XML message to initiate the cross-border payment via Nexus.
                                    </Text>

                                    <Box style={{ position: 'relative' }}>
                                        <ScrollArea h={300} type="always" offsetScrollbars>
                                            <Code block style={{ whiteSpace: "pre", fontSize: "0.7rem", backgroundColor: 'transparent' }}>
                                                {`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>NEXUS-${Date.now()}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${selectedQuote?.quoteId ?? 'QUOTE-ID'}</InstrId>
        <EndToEndId>E2E-${Date.now()}</EndToEndId>
        <TxId>TX-${Date.now()}</TxId>
      </PmtId>
      <PmtTpInf>
        <ClrSys><Prtry>FAST</Prtry></ClrSys>
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="${ptd?.sourceCurrency ?? 'SGD'}">${ptd?.senderPrincipal ?? '0.00'}</IntrBkSttlmAmt>
      <AccptncDtTm>${new Date().toISOString()}</AccptncDtTm>
      <XchgRateInformation>
        <XchgRate>${selectedQuote?.exchangeRate ?? '1.0000'}</XchgRate>
      </XchgRateInformation>
      <ChrgBr>SHAR</ChrgBr>
      <Dbtr><Nm>Demo Sender</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>SG1234567890</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>DBSGSGSG</BICFI></FinInstnId></DbtrAgt>
      <IntermediaryAgent1><FinInstnId><BICFI>SRC-SAP-BIC</BICFI></FinInstnId></IntermediaryAgent1>
      <CdtrAgt><FinInstnId><BICFI>${resolution?.recipientPsp || DEFAULT_PSP_BIC[destCountry] || "BMRIIDJA"}</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>${resolution?.recipientName || "Demo Recipient"}</Nm></Cdtr>
      <CdtrAcct><Id><Othr><Id>${proxyValue}</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`}
                                            </Code>
                                        </ScrollArea>
                                    </Box>
                                </Card>
                            )}

                            <Group>
                                <Button
                                    size="lg"
                                    color="green"
                                    flex={1}
                                    onClick={handleConfirmPayment}
                                    loading={loading}
                                    leftSection={<IconCheck size={20} />}
                                >
                                    Confirm & Send Payment
                                </Button>
                            </Group>
                        </Stack>
                    </Stepper.Step>

                    {/* Step 4: Lifecycle Trace */}
                    <Stepper.Completed>
                        <Stack gap="md" mt="xl">
                            {paymentResult && (paymentResult.status === "ACCC" || paymentResult.status === "ACSP") ? (
                                <>
                                    <Alert icon={<IconCheck size={18} />} color="green" title={paymentResult.status === "ACCC" ? "Payment Completed" : "Settlement in Progress"}>
                                        {paymentResult.status === "ACCC"
                                            ? "Settlement confirmed. Recipient has been credited."
                                            : "Payment accepted by Nexus. Settlement is in progress."}
                                    </Alert>

                                    <Card withBorder p="md">
                                        <Group justify="space-between" align="center" mb="md">
                                            <Text size="sm" fw={500}>Transaction ID (UETR)</Text>
                                            <Badge color="green">ACCC</Badge>
                                        </Group>
                                        <Code block style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
                                            {paymentResult.uetr}
                                        </Code>
                                        <Button
                                            onClick={() => navigate(`/explorer?uetr=${paymentResult.uetr}`)}
                                            variant="light"
                                            size="xs"
                                            mt="sm"
                                            leftSection={<IconInfoCircle size={14} />}
                                        >
                                            View in Payment Explorer
                                        </Button>
                                    </Card>

                                    <Card withBorder>
                                        <Title order={5} mb="md">Payment Lifecycle Trace</Title>
                                        <Timeline active={6} bulletSize={24} lineWidth={2}>
                                            <Timeline.Item bullet={<IconSend size={12} />} title="Quote Requested" color="green">
                                                <Text size="xs" c="dimmed">Source PSP called GET /quotes</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconArrowsExchange size={12} />} title="Quote Selected" color="green">
                                                <Text size="xs" c="dimmed">Selected {selectedQuote?.fxpName} @ {selectedQuote?.exchangeRate}</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconReceipt size={12} />} title="PTD Generated" color="green">
                                                <Text size="xs" c="dimmed">Pre-transaction disclosure computed</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconBuildingBank size={12} />} title="pacs.008 Submitted" color="green">
                                                <Text size="xs" c="dimmed">UETR: {paymentResult.uetr.substring(0, 8)}...</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconServer size={12} />} title="Nexus Validated" color="green">
                                                <Text size="xs" c="dimmed">Quote ID, rate, SAPs verified</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconBuildingBank size={12} />} title="Settlement Complete" color="green">
                                                <Text size="xs" c="dimmed">pacs.002 ACCC received</Text>
                                            </Timeline.Item>
                                        </Timeline>
                                    </Card>
                                </>
                            ) : paymentResult ? (
                                <>
                                    <Alert icon={<IconX size={18} />} color="red" title={`Payment Rejected: ${paymentResult.status}`}>
                                        {paymentResult.error}
                                    </Alert>

                                    <Card withBorder p="md">
                                        <Group justify="space-between" align="center" mb="md">
                                            <Text size="sm" fw={500}>Transaction ID (UETR)</Text>
                                            <Badge color="red">{paymentResult.status}</Badge>
                                        </Group>
                                        <Code block style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
                                            {paymentResult.uetr}
                                        </Code>
                                        <Button
                                            onClick={() => navigate(`/explorer?uetr=${paymentResult.uetr}`)}
                                            variant="light"
                                            size="xs"
                                            mt="sm"
                                            leftSection={<IconInfoCircle size={14} />}
                                        >
                                            View in Payment Explorer
                                        </Button>
                                    </Card>

                                    <Card withBorder>
                                        <Title order={5} mb="md">Payment Lifecycle Trace</Title>
                                        <Timeline active={4} bulletSize={24} lineWidth={2}>
                                            <Timeline.Item bullet={<IconSend size={12} />} title="Quote Requested" color="green">
                                                <Text size="xs" c="dimmed">Source PSP called GET /quotes</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconArrowsExchange size={12} />} title="Quote Selected" color="green">
                                                <Text size="xs" c="dimmed">Selected {selectedQuote?.fxpName} @ {selectedQuote?.exchangeRate}</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconReceipt size={12} />} title="PTD Generated" color="green">
                                                <Text size="xs" c="dimmed">Pre-transaction disclosure computed</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconBuildingBank size={12} />} title="pacs.008 Submitted" color="green">
                                                <Text size="xs" c="dimmed">UETR: {paymentResult.uetr.substring(0, 8)}...</Text>
                                            </Timeline.Item>
                                            <Timeline.Item bullet={<IconX size={12} />} title={`Rejected: ${paymentResult.status}`} color="red">
                                                <Text size="xs" c="red" fw={500}>{paymentResult.error}</Text>
                                                <Code block mt="xs" style={{ fontSize: "0.7rem" }}>
                                                    {`pacs.002 Status: ${paymentResult.status}
Reason: ${paymentResult.error}
UETR: ${paymentResult.uetr}`}
                                                </Code>
                                            </Timeline.Item>
                                        </Timeline>
                                    </Card>
                                </>
                            ) : null}

                            <Button onClick={handleReset} variant="light" leftSection={<IconRefresh size={18} />}>
                                Start New Payment
                            </Button>
                        </Stack>
                    </Stepper.Completed>
                </Stepper>
            </Card>
        </Stack>
    );
}

export default InteractiveDemo;
