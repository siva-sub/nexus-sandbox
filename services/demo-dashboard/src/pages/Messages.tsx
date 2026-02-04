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
import { listPayments, getPaymentEvents } from "../services/api";
import { useEffect } from "react";


const MESSAGES = {
  "acmt.023": {
    name: "Identification Verification Request",
    description: "Proxy resolution request sent to PDO",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.03">
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
      <Id>+66812345678</Id>
      <Tp>MOBL</Tp>
    </Vrfctn>
  </IdVrfctnReq>
</Document>`,
  },
  "acmt.024": {
    name: "Identification Verification Report",
    description: "Proxy resolution response from PDO",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.024.001.03">
  <IdVrfctnRpt>
    <Assgnmt>
      <MsgId>ACMT024-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:01Z</CreDtTm>
    </Assgnmt>
    <Rpt>
      <OrgnlVrfctn>
        <Id>+66812345678</Id>
        <Tp>MOBL</Tp>
      </OrgnlVrfctn>
      <Updtd>
        <Nm>SOMCHAI THONGCHAI</Nm>
        <Acct>
          <Id>
            <Othr>
              <Id>****5678</Id>
            </Othr>
          </Id>
        </Acct>
        <Agt>
          <FinInstnId>
            <BICFI>KASITHBK</BICFI>
          </FinInstnId>
        </Agt>
      </Updtd>
    </Rpt>
  </IdVrfctnRpt>
</Document>`,
  },
  "pacs.008": {
    name: "FI To FI Customer Credit Transfer",
    description: "Payment instruction message",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>PACS008-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:05Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>INGA</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-2026-0203-001</EndToEndId>
        <TxId>TXN-2026-0203-001</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="THB">26452.10</IntrBkSttlmAmt>
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
    name: "Payment Status Report",
    description: "Payment confirmation/rejection status",
    sample: `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>PACS002-2026-0203-001</MsgId>
      <CreDtTm>2026-02-03T10:30:10Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
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
          {Object.entries(MESSAGES).map(([key]) => (
            <Tabs.Tab key={key} value={key}>
              {key}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="live" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder>
              <Title order={5} mb="sm">Recent Transactions</Title>
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

        {Object.entries(MESSAGES).map(([key, msg]) => (
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
