import { useState } from "react";
import {
  Title,
  Card,
  Stack,
  Group,
  Text,
  Badge,
  Tabs,
  Accordion,
  Code,
  Button,
  CopyButton,
  ActionIcon,
  Tooltip,
  SimpleGrid,
  Box,
  Table,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import {
  IconMessage,
  IconCopy,
  IconCheck,
  IconDownload,
  IconArrowRight,
  IconHistory,
  IconCode,
} from "@tabler/icons-react";
import { listPayments, getPaymentEvents, getIsoTemplates } from "../services/api";
import { useEffect } from "react";


interface IsoMessageTemplate {
  messageType: string;
  name: string;
  description: string;
  sample: string;
  sample_xml?: string; // API returns sample_xml
}

const ISO_TEMPLATES: Record<string, IsoMessageTemplate> = {
  "acmt.023": {
    messageType: "acmt.023",
    name: "Identification Verification Request",
    description: "Proxy resolution request sent to PDO",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.04">
  <IdVrfctnReq>
    <Assgnmt>
      <MsgId>ACMT023-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:00Z</CreDtTm>
      <Assgnr>
        <Pty>
          <Id>
            <OrgId>
              <LEI>529900T8BM49AURSDO55</LEI>
            </OrgId>
          </Id>
        </Pty>
      </Assgnr>
      <Assgne>
        <Pty>
          <Id>
            <OrgId>
              <Othr>
                <Id>NEXUSGW</Id>
              </Othr>
            </OrgId>
          </Id>
        </Pty>
      </Assgne>
    </Assgnmt>
    <Vrfctn>
      <Id>RESOLVE-001</Id>
      <PtyAndAcctId>
        <Acct>
          <Prxy>
            <Tp><Cd>MBNO</Cd></Tp>
            <Id>+66812345678</Id>
          </Prxy>
        </Acct>
      </PtyAndAcctId>
    </Vrfctn>
  </IdVrfctnReq>
</Document>`,
  },
  "acmt.024": {
    messageType: "acmt.024",
    name: "Identification Verification Report",
    description: "Proxy resolution response from PDO",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.024.001.04">
  <IdVrfctnRpt>
    <Assgnmt>
      <MsgId>ACMT024-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:01Z</CreDtTm>
    </Assgnmt>
    <Rpt>
      <OrgnlId>REQ20260204-999</OrgnlId>
      <Vrfctn>true</Vrfctn>
      <UpdtdPtyAndAcctId>
        <Pty><Nm>Jane Smith</Nm></Pty>
        <Acct>
          <Id><Othr><Id>0987654321</Id></Othr></Id>
        </Acct>
        <Agt><FinInstnId><BICFI>KASITHBK</BICFI></FinInstnId></Agt>
      </UpdtdPtyAndAcctId>
    </Rpt>
  </IdVrfctnRpt>
</Document>`,
  },
  "pacs.008": {
    messageType: "pacs.008",
    name: "FI To FI Customer Credit Transfer",
    description: "Payment instruction message",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>PACS008-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:05Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-2026-0203-001</EndToEndId>
        <TxId>TXN-2026-0203-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="THB">26452.10</IntrBkSttlmAmt>
      <IntrBkSttlmDt>2026-02-03</IntrBkSttlmDt>
      <AddtlDtTm>
        <AccptncDtTm>2026-02-03T09:30:00Z</AccptncDtTm>
      </AddtlDtTm>
      <InstdAmt Ccy="SGD">1000.00</InstdAmt>
      <XchgRate>26.4521</XchgRate>
      <ChrgBr>SHAR</ChrgBr>
      <Dbtr>
        <Nm>JOHN DOE</Nm>
      </Dbtr>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>DBSSSGSG</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>KASITHBK</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>SOMCHAI THONGCHAI</Nm>
      </Cdtr>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
  },
  "pacs.002": {
    messageType: "pacs.002",
    name: "Payment Status Report",
    description: "Payment confirmation/rejection status",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.15">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>PACS002-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:10Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <OrgnlInstrId>INSTR-2026-0203-001</OrgnlInstrId>
      <OrgnlEndToEndId>E2E-2026-0203-001</OrgnlEndToEndId>
      <OrgnlTxId>TXN-2026-0203-001</OrgnlTxId>
      <TxSts>ACCC</TxSts>
      <StsRsnInf>
        <Rsn>
          <Cd>0000</Cd>
        </Rsn>
        <AddtlInf>Payment completed successfully</AddtlInf>
      </StsRsnInf>
      <AccptncDtTm>2026-02-03T10:30:10Z</AccptncDtTm>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`,
  },
  "pacs.028": {
    messageType: "pacs.028",
    name: "FI To FI Payment Status Request",
    description: "Status enquiry for a transaction",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.028.001.06">
  <FIToFIPmtStsReq>
    <GrpHdr>
      <MsgId>QRY20260204-01</MsgId>
      <CreDtTm>2026-02-04T18:05:00Z</CreDtTm>
    </GrpHdr>
    <TxInf>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <InstgAgt><FinInstnId><BICFI>DBSSSGSG</BICFI></FinInstnId></InstgAgt>
    </TxInf>
  </FIToFIPmtStsReq>
</Document>`,
  },
  "camt.056": {
    messageType: "camt.056",
    name: "FI To FI Payment Cancellation Request",
    description: "Request to cancel an incorrect payment",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.056.001.11">
  <FIToFIPmtCxlReq>
    <Assgnmt>
      <Id>RCL20260204-01</Id>
      <Assgnr>
        <Pty>
          <Nm>Source PSP</Nm>
        </Pty>
      </Assgnr>
      <Assgne>
        <Pty>
          <Nm>Nexus Gateway</Nm>
        </Pty>
      </Assgne>
      <CreDtTm>2026-02-04T19:00:00Z</CreDtTm>
    </Assgnmt>
    <Undrlyg>
      <TxInf>
        <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
        <CxlRsnInf><Rsn><Cd>DUPL</Cd></Rsn></CxlRsnInf>
      </TxInf>
    </Undrlyg>
  </FIToFIPmtCxlReq>
</Document>`,
  },
  "camt.029": {
    messageType: "camt.029",
    name: "Resolution Of Investigation",
    description: "Response to a cancellation request",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.029.001.13">
  <RsltnOfInvstgtn>
    <Assgnmt>
      <Id>RSP20260204-01</Id>
      <Assgnr>
        <Pty>
          <Nm>Nexus Gateway</Nm>
        </Pty>
      </Assgnr>
      <Assgne>
        <Pty>
          <Nm>Source PSP</Nm>
        </Pty>
      </Assgne>
      <CreDtTm>2026-02-04T19:15:00Z</CreDtTm>
    </Assgnmt>
    <Sts><Conf>RJCR</Conf></Sts>
    <CxlDtls>
      <TxInfAndSts>
        <CxlStsRsnInf>
          <Rsn><Cd>RJCR</Cd></Rsn>
        </CxlStsRsnInf>
        <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      </TxInfAndSts>
    </CxlDtls>
  </RsltnOfInvstgtn>
</Document>`,
  },
  "camt.054": {
    messageType: "camt.054",
    name: "Bank to Customer Debit/Credit Notification",
    description: "Reconciliation report for IPS Operators",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.13">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr>
      <MsgId>RECON-20260204</MsgId>
      <CreDtTm>2026-02-04T23:59:59Z</CreDtTm>
    </GrpHdr>
    <Ntfctn>
      <Id>RECON-001</Id>
      <CreDtTm>2026-02-04T23:59:59Z</CreDtTm>
      <Ntry>
        <Amt Ccy="SGD">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-02-04</Dt></BookgDt>
        <ValDt><Dt>2026-02-04</Dt></ValDt>
        <BkTxCd>
          <Domn>
            <Cd>PMNT</Cd>
            <Fmly><Cd>ICDT</Cd></Fmly>
          </Domn>
        </BkTxCd>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`,
  },
  "camt.103": {
    messageType: "camt.103",
    name: "Create Reservation",
    description: "Liquidity reservation request (Method 2a)",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.103.001.03">
  <CretRsvatn>
    <MsgHdr>
      <MsgId>RSV20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:00:02Z</CreDtTm>
    </MsgHdr>
    <RsvatnId>
      <Tp>
        <Cd>THRE</Cd>
      </Tp>
    </RsvatnId>
    <ValSet>
      <Amt>
        <AmtWthCcy Ccy="SGD">25000.00</AmtWthCcy>
      </Amt>
    </ValSet>
  </CretRsvatn>
</Document>`,
  },
  "pain.001": {
    messageType: "pain.001",
    name: "Customer Credit Transfer Initiation",
    description: "Payment initiation request (Method 3)",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.12">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>INIT20260204-123</MsgId>
      <CreDtTm>2026-02-04T18:00:03Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <InitgPty><Nm>Destination IPS</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>P-INIT-01</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt><Dt>2026-02-04</Dt></ReqdExctnDt>
      <Dbtr><Nm>FXP ALPHA</Nm></Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>FX-ACCT-777</Id></Othr></Id>
      </DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>OCBCSGSG</BICFI></FinInstnId></DbtrAgt>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>E2E-01</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="THB">25000.00</InstdAmt></Amt>
        <Cdtr><Nm>Jane Smith</Nm></Cdtr>
        <CdtrAcct>
          <Id><Othr><Id>0987654321</Id></Othr></Id>
        </CdtrAcct>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`,
  },
  "pacs.004": {
    messageType: "pacs.004",
    name: "Payment Return",
    description: "Return of funds (reversal)",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.004.001.14">
  <PmtRtr>
    <GrpHdr>
      <MsgId>RET20260204-001</MsgId>
      <CreDtTm>2026-02-04T18:30:00Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <TxInf>
      <RtrId>RTR-01</RtrId>
      <OrgnlUETR>91398cbd-0838-453f-b2c7-536e829f2b8e</OrgnlUETR>
      <RtrdIntrBkSttlmAmt Ccy="SGD">1000.00</RtrdIntrBkSttlmAmt>
      <RtrRsnInf><Rsn><Cd>CUST</Cd></Rsn></RtrRsnInf>
    </TxInf>
  </PmtRtr>
</Document>`,
  },
};

const FIELD_MAPPINGS = [
  { source: "Vrfctn.Id", processing: "PDO Lookup + LEI resolve", dest: "CdtrAcct.Id" },
  { source: "Vrfctn.Tp", processing: "Normalize to ISO scheme", dest: "CdtrAcct.Tp.Cd" },
  { source: "(generated)", processing: "From PDO response", dest: "CdtrAgt.FinInstnId.LEI" },
  { source: "IntrBkSttlmAmt", processing: "FX conversion applied", dest: "InstdAmt" },
];

export function MessagesPage() {
  const [activeMessage, setActiveMessage] = useState<string>("acmt.023");
  const [livePayments, setLivePayments] = useState<import("../types").Payment[]>([]);
  const [selectedPaymentEvents, setSelectedPaymentEvents] = useState<import("../types").PaymentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUetr, setSelectedUetr] = useState<string | null>(null);

  // Use state for dynamic templates, initializing with static ones
  const [isoTemplates, setIsoTemplates] = useState<Record<string, IsoMessageTemplate>>(ISO_TEMPLATES);

  useEffect(() => {
    // Fetch dynamic templates from backend
    const fetchTemplates = async () => {
      try {
        const templates = await getIsoTemplates();
        // Map API response to internal shape (sample_xml -> sample)
        const mapped: Record<string, IsoMessageTemplate> = {};
        Object.entries(templates).forEach(([key, t]: [string, any]) => {
          mapped[key] = {
            ...t,
            sample: t.sample_xml || t.sample
          };
        });
        setIsoTemplates(mapped);
      } catch (e) {
        console.error("Failed to fetch message templates", e);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (activeMessage === "live") {
      fetchPayments();
    }
  }, [activeMessage]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const data = await listPayments();
      setLivePayments(data.payments);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (uetr: string) => {
    setLoading(true);
    setSelectedUetr(uetr);
    try {
      const data = await getPaymentEvents(uetr);
      setSelectedPaymentEvents(data.events);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>ISO 20022 Explorer</Title>
        <Group>
          {activeMessage === "live" && (
            <Button variant="light" size="xs" onClick={fetchPayments} loading={loading}>Refresh</Button>
          )}
          <Badge color="violet" variant="light" leftSection={<IconMessage size={14} />}>
            ISO Reference
          </Badge>
        </Group>
      </Group>

      <Tabs value={activeMessage} onChange={(v) => setActiveMessage(v || "acmt.023")}>
        <Tabs.List>
          <Tabs.Tab value="live" leftSection={<IconHistory size={14} />}>Live Audit</Tabs.Tab>
          {Object.entries(isoTemplates).map(([key]) => (
            <Tabs.Tab key={key} value={key}>
              {key}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="live" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder>
              <Title order={5} mb="sm">Recent Transactions</Title>
              <Table.ScrollContainer minWidth={450}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>UETR / Time</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {livePayments.map((p) => (
                      <Table.Tr key={p.uetr} bg={selectedUetr === p.uetr ? "var(--mantine-color-blue-light)" : undefined}>
                        <Table.Td>
                          <Text size="xs" ff="monospace" truncate>{p.uetr}</Text>
                          <Text size="xs" c="dimmed">{new Date(p.initiated_at || p.createdAt).toLocaleString()}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" color={p.status === "ACSP" ? "green" : "blue"}>{p.status}</Badge>
                        </Table.Td>
                        <Table.Td>
                          <Button size="compact-xs" variant="subtle" onClick={() => fetchEvents(p.uetr)}>
                            Inspect
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>

            <Stack gap="md">
              {selectedPaymentEvents.length > 0 ? (
                <Accordion variant="separated">
                  {selectedPaymentEvents.map((ev, idx) => (
                    <Accordion.Item key={idx} value={`item-${idx}`}>
                      <Accordion.Control icon={<IconCode size={16} />}>
                        <Group justify="space-between" pr="md">
                          <Text size="sm" fw={500}>{ev.event_type || ev.eventType}</Text>
                          <Text size="xs" c="dimmed">{ev.actor}</Text>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        {((ev.data as Record<string, string>).transformedXml || (ev.data as Record<string, string>).rawXml) ? (
                          <CodeHighlight
                            code={(ev.data as Record<string, string>).transformedXml || (ev.data as Record<string, string>).rawXml}
                            language="xml"
                            styles={{ code: { fontSize: 10 } }}
                          />
                        ) : (
                          <Code block>{JSON.stringify(ev.data, null, 2)}</Code>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              ) : (
                <Card padding="xl" withBorder style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Text c="dimmed">Select a transaction to inspect ISO messages</Text>
                </Card>
              )}
            </Stack>
          </SimpleGrid>
        </Tabs.Panel>

        {Object.entries(isoTemplates).map(([key, msg]) => (
          <Tabs.Panel key={key} value={key} pt="md">
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Card>
                <Group justify="space-between" mb="md">
                  <Box>
                    <Title order={5}>{msg.name}</Title>
                    <Text size="sm" c="dimmed">{msg.description}</Text>
                  </Box>
                  <Badge>{key}</Badge>
                </Group>


                <Accordion defaultValue="structure">
                  <Accordion.Item value="structure">
                    <Accordion.Control>📋 Message Structure</Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        <Text size="sm">
                          <Code>Document</Code> → <Code>{key.includes("acmt") ? "IdVrfctn" : key.includes("pacs.008") ? "FIToFICstmrCdtTrf" : "FIToFIPmtStsRpt"}</Code>
                        </Text>
                        <Text size="xs" c="dimmed">
                          View the sample XML on the right for the complete structure.
                        </Text>
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>

                <Group mt="md">
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconDownload size={14} />}
                  >
                    Download XSD Schema
                  </Button>
                </Group>
              </Card>

              <Card>
                <Group justify="space-between" mb="sm">
                  <Title order={5}>📝 Sample XML</Title>
                  <Group gap="xs">
                    <CopyButton value={msg.sample}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? "Copied" : "Copy"}>
                          <ActionIcon color={copied ? "green" : "gray"} onClick={copy} variant="subtle">
                            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Button variant="subtle" size="xs" leftSection={<IconDownload size={14} />}>
                      Download
                    </Button>
                  </Group>
                </Group>
                <CodeHighlight
                  code={msg.sample}
                  language="xml"
                  withCopyButton={false}
                  styles={{ code: { fontSize: 11 } }}
                />
              </Card>
            </SimpleGrid>
          </Tabs.Panel>
        ))}
      </Tabs>

      {/* Field Mapping Section */}
      <Card>
        <Title order={5} mb="md">🔄 Field Mapping (Nexus Transformation)</Title>
        <Text size="sm" c="dimmed" mb="md">
          How Nexus transforms and maps fields between source and destination messages.
        </Text>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          {FIELD_MAPPINGS.map((mapping, i) => (
            <Card key={i} withBorder p="sm">
              <Stack gap="xs">
                <Group gap="xs">
                  <Code>{mapping.source}</Code>
                  <IconArrowRight size={12} />
                  <Code>{mapping.dest}</Code>
                </Group>
                <Text size="xs" c="dimmed">{mapping.processing}</Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Card>
    </Stack>
  );
}
