import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Badge,
  Card,
  CardHeader,
  CardBody,
  useToast,
  Icon,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Divider,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Link,
  Code,
} from '@chakra-ui/react';
import {
  Upload,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react';
import { api } from '../services/api';

// Tipos
interface SiteSession {
  id: string;
  site: string;
  siteName: string;
  domain: string;
  status: string;
  statusLabel: string;
  accountLabel: string | null;
  cookiesCount: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastErrorAt: string | null;
  createdAt: string;
}

interface SupportedSite {
  id: string;
  name: string;
  domains: string[];
}

interface SessionsResponse {
  success: boolean;
  sessions: SiteSession[];
  supportedSites: SupportedSite[];
}

// Componente de Status Badge
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { colorScheme: string; icon: any }> = {
    ACTIVE: { colorScheme: 'green', icon: CheckCircle },
    NEEDS_REAUTH: { colorScheme: 'orange', icon: AlertTriangle },
    EXPIRED: { colorScheme: 'red', icon: XCircle },
    INVALID: { colorScheme: 'red', icon: XCircle },
    NOT_CONNECTED: { colorScheme: 'gray', icon: LinkIcon },
  };

  const { colorScheme, icon } = config[status] || config.NOT_CONNECTED;

  return (
    <Badge colorScheme={colorScheme} display="flex" alignItems="center" gap={1}>
      <Icon as={icon} boxSize={3} />
      {status === 'ACTIVE' ? 'Conectado' : status === 'NEEDS_REAUTH' ? 'Reconectar' : status === 'EXPIRED' ? 'Expirado' : status === 'INVALID' ? 'Inválido' : 'Não conectado'}
    </Badge>
  );
}

// Componente de Card de Site
function SiteCard({
  site,
  session,
  onUpload,
  onDelete,
  isUploading,
}: {
  site: SupportedSite;
  session: SiteSession | null;
  onUpload: (siteId: string, file: File) => void;
  onDelete: (siteId: string) => void;
  isUploading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(site.id, file);
      e.target.value = '';
    }
  };

  const needsAction = session && session.status !== 'ACTIVE';

  return (
    <Card
      variant="outline"
      borderColor={needsAction ? 'orange.300' : session?.status === 'ACTIVE' ? 'green.300' : 'gray.200'}
      bg={needsAction ? 'orange.50' : undefined}
    >
      <CardHeader pb={2}>
        <HStack justify="space-between">
          <VStack align="start" spacing={0}>
            <Heading size="md">{site.name}</Heading>
            <Text fontSize="sm" color="gray.500">{site.domains[0]}</Text>
          </VStack>
          <StatusBadge status={session?.status || 'NOT_CONNECTED'} />
        </HStack>
      </CardHeader>

      <CardBody pt={2}>
        {session?.status === 'ACTIVE' && (
          <VStack align="start" spacing={2} mb={4}>
            <HStack fontSize="sm" color="gray.600">
              <Text>Cookies:</Text>
              <Text fontWeight="medium">{session.cookiesCount}</Text>
            </HStack>
            {session.lastUsedAt && (
              <HStack fontSize="sm" color="gray.600">
                <Text>Último uso:</Text>
                <Text fontWeight="medium">
                  {new Date(session.lastUsedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </HStack>
            )}
          </VStack>
        )}

        {needsAction && (
          <Alert status="warning" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Ação necessária</AlertTitle>
              <AlertDescription fontSize="xs">
                {session.status === 'NEEDS_REAUTH'
                  ? 'O site pediu login novamente. Faça upload de uma nova sessão.'
                  : 'Sua sessão expirou. Faça upload de uma nova sessão.'}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        <HStack spacing={2}>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            display="none"
          />
          <Button
            leftIcon={<Upload size={16} />}
            colorScheme={needsAction ? 'orange' : 'blue'}
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            isLoading={isUploading}
          >
            {session ? 'Atualizar sessão' : 'Conectar conta'}
          </Button>
          {session && (
            <Button
              leftIcon={<Trash2 size={16} />}
              variant="ghost"
              colorScheme="red"
              size="sm"
              onClick={() => onDelete(site.id)}
            >
              Remover
            </Button>
          )}
        </HStack>
      </CardBody>
    </Card>
  );
}

// Componente Principal
export default function ConnectionsPage() {
  const [sessions, setSessions] = useState<SiteSession[]>([]);
  const [supportedSites, setSupportedSites] = useState<SupportedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSite, setUploadingSite] = useState<string | null>(null);
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<SessionsResponse>('/api/sessions');
      setSessions(data.sessions || []);
      setSupportedSites(data.supportedSites || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar conexões',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleUpload = async (siteId: string, file: File) => {
    try {
      setUploadingSite(siteId);

      const content = await file.text();

      // Valida JSON
      try {
        JSON.parse(content);
      } catch {
        throw new Error('Arquivo inválido. Deve ser um JSON válido.');
      }

      await api.post(`/api/sessions/${siteId}/upload`, {
        storageState: content,
      });

      toast({
        title: 'Sessão salva',
        description: 'Sua conta foi conectada com sucesso.',
        status: 'success',
        duration: 3000,
      });

      fetchSessions();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar sessão',
        description: error.message || 'Verifique se o arquivo é válido.',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setUploadingSite(null);
    }
  };

  const handleDelete = async (siteId: string) => {
    try {
      await api.delete(`/api/sessions/${siteId}`);
      toast({
        title: 'Sessão removida',
        status: 'success',
        duration: 3000,
      });
      fetchSessions();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover sessão',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const getSessionForSite = (siteId: string) => {
    return sessions.find((s) => s.site === siteId) || null;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minH="50vh">
        <Spinner size="xl" />
      </Box>
    );
  }

  return (
    <Box maxW="800px" mx="auto" py={8} px={4}>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <VStack align="start" spacing={1}>
            <Heading size="lg">Conexões</Heading>
            <Text color="gray.600">
              Conecte suas contas para monitorar sites que requerem login
            </Text>
          </VStack>
          <HStack>
            <Button
              leftIcon={<HelpCircle size={16} />}
              variant="ghost"
              size="sm"
              onClick={onOpen}
            >
              Como funciona?
            </Button>
            <Button
              leftIcon={<RefreshCw size={16} />}
              variant="outline"
              size="sm"
              onClick={fetchSessions}
            >
              Atualizar
            </Button>
          </HStack>
        </HStack>

        <Divider />

        {/* Alerta de sessão necessária */}
        {sessions.some((s) => s.status === 'NEEDS_REAUTH') && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Algumas conexões precisam de atenção</AlertTitle>
              <AlertDescription>
                Reconecte as contas marcadas em laranja para continuar monitorando.
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Cards de Sites */}
        <VStack spacing={4} align="stretch">
          {supportedSites
            .filter((site) => ['MERCADO_LIVRE'].includes(site.id)) // Apenas ML por enquanto
            .map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                session={getSessionForSite(site.id)}
                onUpload={handleUpload}
                onDelete={handleDelete}
                isUploading={uploadingSite === site.id}
              />
            ))}
        </VStack>

        {/* FAQ rápido */}
        <Box mt={8}>
          <Heading size="md" mb={4}>Dúvidas frequentes</Heading>
          <Accordion allowToggle>
            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  O que é uma sessão?
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                Uma sessão é um arquivo que contém os cookies do seu navegador após fazer login em um site.
                Ela permite que o RadarOne acesse o site como se fosse você, sem precisar da sua senha.
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  É seguro?
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                Sim. A sessão é criptografada com AES-256-GCM antes de ser armazenada.
                Nunca pedimos sua senha e você pode revogar a sessão a qualquer momento.
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  Quando preciso reconectar?
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                Quando o site pedir login novamente (normalmente a cada 7-30 dias) ou quando você
                mudar sua senha no site. O RadarOne avisará quando for necessário.
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  Como exportar o arquivo de sessão?
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                <VStack align="start" spacing={2}>
                  <Text>Você pode exportar usando uma extensão de navegador ou ferramentas de desenvolvedor:</Text>
                  <Text fontWeight="medium">Opção 1 (Mais fácil):</Text>
                  <Text>
                    Instale a extensão{' '}
                    <Link href="https://chrome.google.com/webstore/detail/export-cookies/njklnbpdibmhcpfggcfhgcakklcjigfa" isExternal color="blue.500">
                      Export Cookies <ExternalLink size={12} style={{ display: 'inline' }} />
                    </Link>
                    {' '}no Chrome, faça login no Mercado Livre, e exporte os cookies como JSON.
                  </Text>
                  <Text fontWeight="medium" mt={2}>Opção 2 (Avançado):</Text>
                  <Text>
                    Use o Playwright CLI: <Code>npx playwright codegen mercadolivre.com.br --save-storage=storage.json</Code>
                  </Text>
                </VStack>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </Box>
      </VStack>

      {/* Modal de ajuda */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Como conectar sua conta</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="start" spacing={4}>
              <Text>
                Alguns sites, como o Mercado Livre, exigem que você esteja logado para ver certos anúncios.
                Para o RadarOne monitorar esses anúncios, você precisa "conectar" sua conta.
              </Text>

              <Heading size="sm">Passo a passo:</Heading>
              <VStack align="start" spacing={2} pl={4}>
                <Text>1. Faça login normalmente no site (ex: Mercado Livre)</Text>
                <Text>2. Exporte os cookies usando uma extensão ou ferramenta</Text>
                <Text>3. Faça upload do arquivo .json aqui no RadarOne</Text>
                <Text>4. Pronto! Seus monitores funcionarão automaticamente</Text>
              </VStack>

              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <Box fontSize="sm">
                  <AlertTitle>Sua senha nunca é compartilhada</AlertTitle>
                  <AlertDescription>
                    O arquivo de sessão contém apenas cookies, não sua senha.
                    Você pode revogar a qualquer momento.
                  </AlertDescription>
                </Box>
              </Alert>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={onClose}>
              Entendi
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
