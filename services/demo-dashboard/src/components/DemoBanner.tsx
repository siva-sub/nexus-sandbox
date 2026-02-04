// Demo Mode Banner Component
// Shows when running on GitHub Pages (without backend)

import { Alert, Code, Text, Stack, Anchor, Group, Badge } from "@mantine/core";
import { IconInfoCircle, IconBrandDocker, IconBrandGithub } from "@tabler/icons-react";
import { MOCK_ENABLED } from "../services/mockData";

export function DemoBanner() {
    if (!MOCK_ENABLED) return null;

    return (
        <Alert
            icon={<IconInfoCircle size={20} />}
            title={
                <Group gap="xs">
                    <Text fw={600}>GitHub Pages Demo Mode</Text>
                    <Badge color="orange" size="sm" variant="light">Static Preview</Badge>
                </Group>
            }
            color="blue"
            variant="light"
            mb="md"
            styles={{
                message: { fontSize: 14 }
            }}
        >
            <Stack gap="xs">
                <Text size="sm">
                    This is a static demo showcasing the UI. For the <strong>full interactive experience</strong> with real API calls and payment processing:
                </Text>
                <Code block>
                    {`git clone https://github.com/siva-sub/nexus-sandbox.git
cd nexus-sandbox
docker compose -f docker-compose.lite.yml up -d`}
                </Code>
                <Group gap="xs">
                    <Anchor
                        href="https://github.com/siva-sub/nexus-sandbox"
                        target="_blank"
                        size="sm"
                    >
                        <Group gap={4}>
                            <IconBrandGithub size={16} />
                            View on GitHub
                        </Group>
                    </Anchor>
                    <Text size="sm" c="dimmed">•</Text>
                    <Anchor
                        href="https://github.com/siva-sub/nexus-sandbox#-quick-start-3-steps"
                        target="_blank"
                        size="sm"
                    >
                        <Group gap={4}>
                            <IconBrandDocker size={16} />
                            Docker Quick Start
                        </Group>
                    </Anchor>
                </Group>
            </Stack>
        </Alert>
    );
}
