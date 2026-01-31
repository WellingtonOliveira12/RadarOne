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
  Clock,
  Shield,
} from 'lucide-react';
import { api } from '../services/api';

// Função para calcular dias restantes
function getDaysUntilExpiration(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffTime = expires.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Função para validar estrutura do storageState
function validateStorageState(content: string): { valid: boolean; error?: string; cookiesCount?: number } {
  try {
    const data = JSON.parse(content);

    if (!data.cookies || !Array.isArray(data.cookies)) {
      return { valid: false, error: 'Arquivo inválido: campo "cookies" não encontrado.' };
    }

    if (!data.origins || !Array.isArray(data.origins)) {
      return { valid: false, error: 'Arquivo inválido: campo "origins" não encontrado.' };
    }

    if (data.cookies.length === 0) {
      return { valid: false, error: 'Arquivo inválido: nenhum cookie encontrado. Faça login no site primeiro.' };
    }

    // Verifica se tem cookies do Mercado Livre
    const mlCookies = data.cookies.filter((c: any) =>
      c.domain?.includes('mercadolivre') || c.domain?.includes('mercadolibre')
    );

    if (mlCookies.length === 0) {
      return { valid: false, error: 'Arquivo inválido: nenhum cookie do Mercado Livre encontrado. Certifique-se de fazer login no site correto.' };
    }

    return { valid: true, cookiesCount: data.cookies.length };
  } catch {
    return { valid: false, error: 'Arquivo inválido: não é um JSON válido.' };
  }
}

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

// Componente de Countdown de Expiração
function ExpirationCountdown({ expiresAt }: { expiresAt: string | null }) {
  const daysLeft = getDaysUntilExpiration(expiresAt);

  if (daysLeft === null) return null;

  if (daysLeft <= 0) {
    return (
      <Badge colorScheme="red" display="flex" alignItems="center" gap={1}>
        <Icon as={Clock} boxSize={3} />
        Expirado
      </Badge>
    );
  }

  if (daysLeft <= 3) {
    return (
      <Badge colorScheme="red" display="flex" alignItems="center" gap={1}>
        <Icon as={Clock} boxSize={3} />
        Expira em {daysLeft} dia{daysLeft > 1 ? 's' : ''}
      </Badge>
    );
  }

  if (daysLeft <= 7) {
    return (
      <Badge colorScheme="orange" display="flex" alignItems="center" gap={1}>
        <Icon as={Clock} boxSize={3} />
        Expira em {daysLeft} dias
      </Badge>
    );
  }

  return (
    <Text fontSize="xs" color="gray.500">
      Expira em {daysLeft} dias
    </Text>
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
  const daysLeft = getDaysUntilExpiration(session?.expiresAt || null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(site.id, file);
      e.target.value = '';
    }
  };

  const needsAction = session && session.status !== 'ACTIVE';
  const expirationWarning = session?.status === 'ACTIVE' && daysLeft !== null && daysLeft <= 7;

  // Determina a borda e fundo do card
  const getBorderColor = () => {
    if (needsAction) return 'orange.300';
    if (expirationWarning && daysLeft && daysLeft <= 3) return 'red.300';
    if (expirationWarning) return 'yellow.400';
    if (session?.status === 'ACTIVE') return 'green.300';
    return 'gray.200';
  };

  const getBgColor = () => {
    if (needsAction) return 'orange.50';
    if (expirationWarning && daysLeft && daysLeft <= 3) return 'red.50';
    if (expirationWarning) return 'yellow.50';
    return undefined;
  };

  return (
    <Card variant="outline" borderColor={getBorderColor()} bg={getBgColor()}>
      <CardHeader pb={2}>
        <HStack justify="space-between">
          <VStack align="start" spacing={0}>
            <HStack>
              <Heading size="md">{site.name}</Heading>
              <Badge colorScheme="purple" fontSize="xs" display="flex" alignItems="center" gap={1}>
                <Icon as={Shield} boxSize={3} />
                Requer login
              </Badge>
            </HStack>
            <Text fontSize="sm" color="gray.500">{site.domains[0]}</Text>
          </VStack>
          <StatusBadge status={session?.status || 'NOT_CONNECTED'} />
        </HStack>
      </CardHeader>

      <CardBody pt={2}>
        {/* Sessão ativa - mostrar informações */}
        {session?.status === 'ACTIVE' && (
          <VStack align="start" spacing={2} mb={4}>
            <HStack fontSize="sm" color="gray.600" justify="space-between" width="100%">
              <HStack>
                <Text>Cookies:</Text>
                <Text fontWeight="medium">{session.cookiesCount}</Text>
              </HStack>
              <ExpirationCountdown expiresAt={session.expiresAt} />
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

        {/* Alerta de expiração próxima */}
        {expirationWarning && daysLeft && daysLeft <= 7 && (
          <Alert status={daysLeft <= 3 ? 'error' : 'warning'} mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">
                {daysLeft <= 3 ? 'Expira muito em breve!' : 'Expira em breve'}
              </AlertTitle>
              <AlertDescription fontSize="xs">
                {daysLeft <= 1
                  ? 'Sua sessão expira hoje ou amanhã. Recomendamos reconectar agora.'
                  : `Sua sessão expira em ${daysLeft} dias. Recomendamos reconectar em breve para evitar interrupções.`}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Alerta de ação necessária */}
        {needsAction && (
          <Alert status="warning" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Ação necessária</AlertTitle>
              <AlertDescription fontSize="xs">
                {session.status === 'NEEDS_REAUTH'
                  ? 'O site pediu login novamente. Faça upload de uma nova sessão para continuar monitorando.'
                  : session.status === 'EXPIRED'
                  ? 'Sua sessão expirou. Faça upload de uma nova sessão.'
                  : 'Sessão inválida. Por favor, gere uma nova sessão.'}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Sem sessão - mostrar instrução */}
        {!session && (
          <Alert status="info" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Conecte sua conta</AlertTitle>
              <AlertDescription fontSize="xs">
                Para monitorar anúncios do {site.name}, você precisa conectar sua conta.
                Nunca pedimos sua senha - usamos apenas os cookies de sessão.
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
            colorScheme={needsAction || expirationWarning ? 'orange' : session ? 'green' : 'blue'}
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            isLoading={isUploading}
          >
            {needsAction
              ? 'Reconectar agora'
              : expirationWarning
              ? 'Renovar sessão'
              : session
              ? 'Atualizar sessão'
              : 'Conectar conta'}
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
      // NOTA: Usa skipAutoLogout pois é chamada não-crítica e não deve deslogar o usuário
      const data = await api.request<SessionsResponse>('/api/sessions', {
        method: 'GET',
        skipAutoLogout: true,
      });
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

      // Verifica tamanho do arquivo (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Arquivo muito grande. O tamanho máximo é 5MB.');
      }

      const content = await file.text();

      // Valida estrutura do storageState
      const validation = validateStorageState(content);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      await api.request(`/api/sessions/${siteId}/upload`, {
        method: 'POST',
        body: { storageState: content },
        skipAutoLogout: true,
      });

      toast({
        title: 'Conta conectada!',
        description: `Sessão salva com ${validation.cookiesCount} cookies. Seus monitores agora funcionarão automaticamente.`,
        status: 'success',
        duration: 5000,
      });

      fetchSessions();
    } catch (error: any) {
      toast({
        title: 'Erro ao conectar conta',
        description: error.message || 'Verifique se o arquivo é válido.',
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
    } finally {
      setUploadingSite(null);
    }
  };

  const handleDelete = async (siteId: string) => {
    try {
      await api.request(`/api/sessions/${siteId}`, {
        method: 'DELETE',
        skipAutoLogout: true,
      });
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
