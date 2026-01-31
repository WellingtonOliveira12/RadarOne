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
  Code,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useClipboard,
} from '@chakra-ui/react';
import {
  Upload,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Trash2,
  Link as LinkIcon,
  Clock,
  Shield,
  Terminal,
  FileText,
  Copy,
  Check,
  FileUp,
} from 'lucide-react';
import { api } from '../services/api';

// ============================================================
// UTILITÁRIOS
// ============================================================

function getDaysUntilExpiration(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffTime = expires.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

const PLAYWRIGHT_COMMAND = 'npx playwright codegen mercadolivre.com.br --save-storage=sessao.json';

/**
 * Valida e normaliza o arquivo de sessão.
 * Aceita 2 formatos:
 *   1) Playwright storageState: { cookies: [...], origins: [...] }
 *   2) Cookie dump (array puro): [ { domain, name, value, ... }, ... ]
 * Retorna o JSON normalizado para storageState (o formato que o backend aceita).
 */
export function validateAndNormalizeSessionFile(content: string): {
  valid: boolean;
  error?: string;
  cookiesCount?: number;
  normalized?: string;
} {
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    return { valid: false, error: 'Este arquivo não é um JSON válido. Verifique se exportou corretamente.' };
  }

  // Formato 2: cookie dump (array puro) → normalizar para storageState
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { valid: false, error: 'O arquivo está vazio (nenhum cookie encontrado). Faça login no Mercado Livre primeiro.' };
    }
    const hasMl = data.some((c: any) =>
      c.domain?.includes('mercadolivre') || c.domain?.includes('mercadolibre')
    );
    if (!hasMl) {
      return {
        valid: false,
        error: 'Nenhum cookie do Mercado Livre encontrado neste arquivo. Certifique-se de exportar após fazer login no mercadolivre.com.br.',
      };
    }
    const normalized = JSON.stringify({ cookies: data, origins: [] });
    return { valid: true, cookiesCount: data.length, normalized };
  }

  // Formato 1: storageState { cookies, origins }
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Formato não reconhecido. O arquivo deve ser um JSON de sessão (.json).' };
  }

  if (!data.cookies || !Array.isArray(data.cookies)) {
    return { valid: false, error: 'Arquivo inválido: campo "cookies" não encontrado. Verifique se exportou o arquivo correto.' };
  }

  if (!Array.isArray(data.origins)) {
    // Tolerante: se não tem origins, cria vazio
    data.origins = [];
  }

  if (data.cookies.length === 0) {
    return { valid: false, error: 'Nenhum cookie encontrado no arquivo. Faça login no Mercado Livre antes de exportar.' };
  }

  const mlCookies = data.cookies.filter((c: any) =>
    c.domain?.includes('mercadolivre') || c.domain?.includes('mercadolibre')
  );

  if (mlCookies.length === 0) {
    return {
      valid: false,
      error: 'Nenhum cookie do Mercado Livre encontrado neste arquivo. Certifique-se de exportar após fazer login no mercadolivre.com.br.',
    };
  }

  const normalized = JSON.stringify({ cookies: data.cookies, origins: data.origins || [] });
  return { valid: true, cookiesCount: data.cookies.length, normalized };
}

// ============================================================
// TIPOS
// ============================================================

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

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { colorScheme: string; icon: any }> = {
    ACTIVE: { colorScheme: 'green', icon: CheckCircle },
    NEEDS_REAUTH: { colorScheme: 'orange', icon: AlertTriangle },
    EXPIRED: { colorScheme: 'red', icon: XCircle },
    INVALID: { colorScheme: 'red', icon: XCircle },
    NOT_CONNECTED: { colorScheme: 'gray', icon: LinkIcon },
  };

  const { colorScheme, icon } = config[status] || config.NOT_CONNECTED;
  const labels: Record<string, string> = {
    ACTIVE: 'Conectado',
    NEEDS_REAUTH: 'Reconectar',
    EXPIRED: 'Expirado',
    INVALID: 'Inválido',
  };

  return (
    <Badge colorScheme={colorScheme} display="flex" alignItems="center" gap={1}>
      <Icon as={icon} boxSize={3} />
      {labels[status] || 'Não conectado'}
    </Badge>
  );
}

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

// ============================================================
// ASSISTENTE DE CONEXÃO (WIZARD MODAL)
// ============================================================

function ConnectionWizard({
  isOpen,
  onClose,
  siteName,
  siteId,
  onUploadSuccess,
  serverUnavailable,
}: {
  isOpen: boolean;
  onClose: () => void;
  siteName: string;
  siteId: string;
  onUploadSuccess: () => void;
  serverUnavailable: boolean;
}) {
  const { onCopy, hasCopied } = useClipboard(PLAYWRIGHT_COMMAND);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    cookiesCount?: number;
    normalized?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<{
    message: string;
    details?: string;
    isAuthError?: boolean;
  } | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setValidationResult(null);
      setIsUploading(false);
      setUploadStatus('');
      setIsDragging(false);
      setUploadError(null);
    }
  }, [isOpen]);

  const processFile = async (file: File) => {
    setUploadError(null);
    if (file.size > 5 * 1024 * 1024) {
      setValidationResult({ valid: false, error: 'Arquivo muito grande (max 5 MB).' });
      setSelectedFile(file);
      return;
    }
    if (!file.name.endsWith('.json')) {
      setValidationResult({ valid: false, error: 'Selecione um arquivo .json' });
      setSelectedFile(file);
      return;
    }
    const content = await file.text();
    const result = validateAndNormalizeSessionFile(content);
    setSelectedFile(file);
    setValidationResult(result);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleSubmit = async () => {
    if (!validationResult?.valid || !validationResult.normalized) return;
    setUploadError(null);

    try {
      setIsUploading(true);

      // Step 1: Wake server with health ping (fast, no auth needed)
      setUploadStatus('Verificando servidor...');
      try {
        await api.request('/health', { method: 'GET', timeout: 15000, skipAutoLogout: true });
      } catch {
        // Server didn't respond to health — try anyway, requestWithRetry will handle it
      }

      // Step 2: Upload
      setUploadStatus('Enviando arquivo de sessão...');
      await api.requestWithRetry(`/api/sessions/${siteId}/upload`, {
        method: 'POST',
        body: { storageState: validationResult.normalized },
        skipAutoLogout: true,
      });

      toast({
        title: 'Conta conectada!',
        description: `Sessão salva com ${validationResult.cookiesCount} cookies. Seus monitores agora funcionarão automaticamente.`,
        status: 'success',
        duration: 5000,
      });
      onUploadSuccess();
      onClose();
    } catch (error: any) {
      // Differentiate error types for user
      let message: string;
      let details: string | undefined;

      if (error.isNetworkError || error.errorCode === 'NETWORK_ERROR' || error.errorCode === 'NETWORK_TIMEOUT') {
        message = 'O servidor não respondeu. Ele pode estar iniciando (isso leva até 60 segundos no primeiro acesso do dia).';
        details = `Código: ${error.errorCode || 'NETWORK_ERROR'} | Tentativas: 3`;
      } else if (error.status === 401) {
        message = 'Sua sessão do RadarOne expirou. Faça login novamente.';
        details = `HTTP 401 — ${error.errorCode || 'INVALID_TOKEN'}`;
        setUploadError({ message, details, isAuthError: true });
        return;
      } else if (error.status === 400) {
        message = error.message || 'O servidor rejeitou o arquivo. Verifique se é um arquivo de sessão válido.';
        details = `HTTP 400 — ${error.errorCode || 'VALIDATION_ERROR'}`;
      } else if (error.status >= 500) {
        message = 'Erro interno no servidor. Tente novamente em instantes.';
        details = `HTTP ${error.status} — ${error.errorCode || 'SERVER_ERROR'}`;
      } else {
        message = error.message || 'Erro desconhecido. Tente novamente.';
        details = error.status ? `HTTP ${error.status}` : undefined;
      }

      setUploadError({ message, details });
    } finally {
      setIsUploading(false);
      setUploadStatus('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Conectar conta &ndash; {siteName}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={5} align="stretch">
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Box fontSize="sm">
                <Text>
                  O {siteName} exige login para mostrar certos anun&#x301;cios. Para o RadarOne monitorar por voce&#x302;,
                  precisamos de um <strong>Arquivo de Sessão (.json)</strong>.
                </Text>
                <Text mt={1} fontWeight="medium">
                  Sua senha nunca é pedida nem armazenada.
                </Text>
              </Box>
            </Alert>

            <Heading size="sm">Como gerar o arquivo</Heading>

            <Tabs variant="enclosed" colorScheme="blue">
              <TabList>
                <Tab data-testid="tab-automatico">
                  <HStack spacing={1}>
                    <Icon as={Terminal} boxSize={4} />
                    <Text>Automático (Recomendado)</Text>
                  </HStack>
                </Tab>
                <Tab data-testid="tab-extensao">
                  <HStack spacing={1}>
                    <Icon as={FileText} boxSize={4} />
                    <Text>Via extensão</Text>
                  </HStack>
                </Tab>
              </TabList>

              <TabPanels>
                {/* TAB 1: Playwright automático */}
                <TabPanel px={0}>
                  <VStack align="start" spacing={3}>
                    <Text fontSize="sm" color="gray.600">
                      Gera o arquivo direto no seu computador. Você fará login numa janela de navegador;
                      o RadarOne não vê sua senha.
                    </Text>

                    <Box w="100%">
                      <Text fontWeight="medium" fontSize="sm" mb={1}>1. Abra o terminal e cole este comando:</Text>
                      <HStack
                        bg="gray.50"
                        border="1px solid"
                        borderColor="gray.200"
                        borderRadius="md"
                        p={3}
                        justify="space-between"
                      >
                        <Code fontSize="xs" bg="transparent" wordBreak="break-all" data-testid="playwright-command">
                          {PLAYWRIGHT_COMMAND}
                        </Code>
                        <Button
                          size="xs"
                          leftIcon={hasCopied ? <Check size={12} /> : <Copy size={12} />}
                          onClick={onCopy}
                          colorScheme={hasCopied ? 'green' : 'gray'}
                          flexShrink={0}
                          data-testid="copy-command-btn"
                        >
                          {hasCopied ? 'Copiado' : 'Copiar'}
                        </Button>
                      </HStack>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">2. Faça login no Mercado Livre na janela que abrir.</Text>
                      <Text fontSize="xs" color="gray.500">Depois feche a janela do navegador.</Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">
                        3. Envie o arquivo <Code fontSize="xs">sessao.json</Code> gerado na área abaixo.
                      </Text>
                    </Box>
                  </VStack>
                </TabPanel>

                {/* TAB 2: Via extensão */}
                <TabPanel px={0}>
                  <VStack align="start" spacing={3}>
                    <Text fontSize="sm" color="gray.600">
                      Se preferir usar uma extensão de navegador, siga os passos abaixo.
                    </Text>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm" mb={1}>1. Instale uma extensão que exporte cookies para JSON.</Text>
                      <Text fontSize="xs" color="gray.500">
                        Na loja de extensões do seu navegador, procure por termos como:
                      </Text>
                      <Box pl={3} mt={1}>
                        <Text fontSize="xs" color="gray.600">&bull; "Export cookies JSON"</Text>
                        <Text fontSize="xs" color="gray.600">&bull; "Cookie editor export"</Text>
                        <Text fontSize="xs" color="gray.600">&bull; "EditThisCookie"</Text>
                      </Box>
                      <Text fontSize="xs" color="gray.400" mt={1}>
                        Extensões mudam com frequência. Se uma não estiver disponível, use outra ou
                        prefira o método automático.
                      </Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">2. Faça login no mercadolivre.com.br.</Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">3. Use a extensão para exportar os cookies como .json.</Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">4. Envie o arquivo .json na área abaixo.</Text>
                    </Box>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>

            {/* UPLOAD AREA */}
            <Divider />
            <Heading size="sm">Enviar Arquivo de Sessão</Heading>

            <Box
              ref={dropZoneRef}
              data-testid="drop-zone"
              border="2px dashed"
              borderColor={
                isDragging ? 'blue.400'
                : validationResult?.valid ? 'green.300'
                : validationResult && !validationResult.valid ? 'red.300'
                : 'gray.300'
              }
              borderRadius="lg"
              p={6}
              textAlign="center"
              cursor="pointer"
              bg={isDragging ? 'blue.50' : validationResult?.valid ? 'green.50' : undefined}
              transition="all 0.2s"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                display="none"
                data-testid="file-input"
              />
              <VStack spacing={2}>
                <Icon as={FileUp} boxSize={8} color={validationResult?.valid ? 'green.500' : 'gray.400'} />
                {selectedFile ? (
                  <>
                    <Text fontSize="sm" fontWeight="medium">
                      {selectedFile.name}
                    </Text>
                    {validationResult?.valid && (
                      <Badge colorScheme="green">{validationResult.cookiesCount} cookies encontrados</Badge>
                    )}
                  </>
                ) : (
                  <>
                    <Text fontSize="sm" color="gray.500">
                      Arraste o arquivo .json aqui ou clique para escolher
                    </Text>
                    <Text fontSize="xs" color="gray.400">
                      Tamanho máximo: 5 MB
                    </Text>
                  </>
                )}
              </VStack>
            </Box>

            {/* Validation error */}
            {validationResult && !validationResult.valid && (
              <Alert status="error" borderRadius="md" data-testid="validation-error">
                <AlertIcon />
                <Box fontSize="sm">
                  <AlertTitle>Arquivo inválido</AlertTitle>
                  <AlertDescription>{validationResult.error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {/* Server unavailable warning */}
            {serverUnavailable && !uploadError && (
              <Alert status="warning" borderRadius="md" data-testid="server-warning">
                <AlertIcon />
                <Box fontSize="sm">
                  <AlertTitle>Servidor iniciando</AlertTitle>
                  <AlertDescription>
                    O servidor pode estar em processo de inicialização. O envio pode demorar até 60 segundos.
                  </AlertDescription>
                </Box>
              </Alert>
            )}

            {/* Upload error (inline, with retry or re-login) */}
            {uploadError && (
              <Alert status={uploadError.isAuthError ? 'warning' : 'error'} borderRadius="md" data-testid="upload-error">
                <AlertIcon />
                <Box fontSize="sm" flex="1">
                  <AlertTitle>{uploadError.isAuthError ? 'Sessão expirada' : 'Erro ao conectar conta'}</AlertTitle>
                  <AlertDescription>{uploadError.message}</AlertDescription>
                  {uploadError.details && (
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      Detalhes técnicos: {uploadError.details}
                    </Text>
                  )}
                  {uploadError.isAuthError && (
                    <Button
                      size="sm"
                      colorScheme="orange"
                      mt={2}
                      onClick={() => { window.location.href = '/login?reason=session_expired'; }}
                    >
                      Fazer login
                    </Button>
                  )}
                </Box>
              </Alert>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              colorScheme={uploadError ? 'orange' : 'blue'}
              leftIcon={<Upload size={16} />}
              isDisabled={!validationResult?.valid}
              isLoading={isUploading}
              loadingText={uploadStatus || 'Enviando...'}
              onClick={handleSubmit}
              data-testid="submit-upload-btn"
            >
              {uploadError ? 'Tentar novamente' : 'Conectar conta'}
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ============================================================
// SITE CARD
// ============================================================

function SiteCard({
  site,
  session,
  onConnectClick,
  onDelete,
}: {
  site: SupportedSite;
  session: SiteSession | null;
  onConnectClick: () => void;
  onDelete: (siteId: string) => void;
}) {
  const daysLeft = getDaysUntilExpiration(session?.expiresAt || null);
  const needsAction = session && session.status !== 'ACTIVE';
  const expirationWarning = session?.status === 'ACTIVE' && daysLeft !== null && daysLeft <= 7;

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

  const buttonLabel = needsAction
    ? 'Reconectar agora'
    : expirationWarning
    ? 'Renovar sessão'
    : session
    ? 'Atualizar sessão'
    : 'Conectar conta';

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
                  : `Sua sessão expira em ${daysLeft} dias. Recomendamos reconectar em breve.`}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {needsAction && (
          <Alert status="warning" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Ação necessária</AlertTitle>
              <AlertDescription fontSize="xs">
                {session.status === 'NEEDS_REAUTH'
                  ? 'O site pediu login novamente. Gere um novo arquivo de sessão para continuar monitorando.'
                  : session.status === 'EXPIRED'
                  ? 'Sua sessão expirou. Gere um novo arquivo de sessão.'
                  : 'Sessão inválida. Por favor, gere uma nova sessão.'}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {!session && (
          <Alert status="info" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">Conecte sua conta</AlertTitle>
              <AlertDescription fontSize="xs">
                Para monitorar anúncios do {site.name}, você precisa conectar sua conta
                enviando um Arquivo de Sessão (.json). Nunca pedimos sua senha.
              </AlertDescription>
            </Box>
          </Alert>
        )}

        <HStack spacing={2}>
          <Button
            leftIcon={<Upload size={16} />}
            colorScheme={needsAction || expirationWarning ? 'orange' : session ? 'green' : 'blue'}
            size="sm"
            onClick={onConnectClick}
            data-testid="connect-button"
          >
            {buttonLabel}
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

// ============================================================
// FALLBACK & MAIN
// ============================================================

const FALLBACK_SUPPORTED_SITES: SupportedSite[] = [
  {
    id: 'MERCADO_LIVRE',
    name: 'Mercado Livre',
    domains: ['mercadolivre.com.br', 'mercadolibre.com'],
  },
];

export default function ConnectionsPage() {
  const [sessions, setSessions] = useState<SiteSession[]>([]);
  const [supportedSites, setSupportedSites] = useState<SupportedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const toast = useToast();

  // Wizard modal state
  const { isOpen: isWizardOpen, onOpen: onWizardOpen, onClose: onWizardClose } = useDisclosure();
  const [wizardSite, setWizardSite] = useState<SupportedSite | null>(null);

  const effectiveSites = supportedSites.length > 0 ? supportedSites : FALLBACK_SUPPORTED_SITES;

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      setIsSessionExpired(false);
      const data = await api.requestWithRetry<SessionsResponse>('/api/sessions', {
        method: 'GET',
        skipAutoLogout: true,
      });
      setSessions(data.sessions || []);
      setSupportedSites(data.supportedSites || []);
    } catch (error: any) {
      let description = 'Erro desconhecido. Tente novamente.';
      if (error.isNetworkError || error.isColdStart) {
        description = 'Servidor temporariamente indisponível. Tente novamente em instantes.';
      } else if (error.status === 401) {
        description = 'Sua sessão do RadarOne expirou. Faça login novamente.';
        setIsSessionExpired(true);
      } else if (error.status >= 500) {
        description = 'Erro no servidor. Tente novamente.';
      } else if (error.status === 404) {
        description = 'Serviço não encontrado. Contate o suporte.';
      } else if (error.message) {
        description = error.message;
      }
      setFetchError(description);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleConnectClick = (site: SupportedSite) => {
    setWizardSite(site);
    onWizardOpen();
  };

  const handleDelete = async (siteId: string) => {
    try {
      await api.request(`/api/sessions/${siteId}`, {
        method: 'DELETE',
        skipAutoLogout: true,
      });
      toast({ title: 'Sessão removida', status: 'success', duration: 3000 });
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

  const getSessionForSite = (siteId: string) =>
    sessions.find((s) => s.site === siteId) || null;

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
          <Button
            leftIcon={<RefreshCw size={16} />}
            variant="outline"
            size="sm"
            onClick={fetchSessions}
          >
            Atualizar
          </Button>
        </HStack>

        <Divider />

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

        {fetchError && (
          <Alert status={isSessionExpired ? 'warning' : 'error'} borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>{isSessionExpired ? 'Sessão expirada' : 'Erro ao carregar conexões'}</AlertTitle>
              <AlertDescription>{fetchError}</AlertDescription>
            </Box>
            {isSessionExpired ? (
              <Button
                size="sm"
                colorScheme="orange"
                onClick={() => { window.location.href = '/login?reason=session_expired'; }}
                ml={2}
              >
                Fazer login
              </Button>
            ) : (
              <Button size="sm" colorScheme="red" variant="outline" onClick={fetchSessions} ml={2}>
                Tentar novamente
              </Button>
            )}
          </Alert>
        )}

        {/* Site Cards */}
        <VStack spacing={4} align="stretch">
          {effectiveSites
            .filter((site) => ['MERCADO_LIVRE'].includes(site.id))
            .map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                session={getSessionForSite(site.id)}
                onConnectClick={() => handleConnectClick(site)}
                onDelete={handleDelete}
              />
            ))}
        </VStack>

        {/* FAQ */}
        <Box mt={8}>
          <Heading size="md" mb={4}>Dúvidas frequentes</Heading>
          <Accordion allowToggle>
            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  O que é um Arquivo de Sessão?
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                É um arquivo .json que contém os dados de login do seu navegador (cookies) após
                você entrar em um site. Com ele, o RadarOne consegue acessar o site como se fosse
                você, sem precisar da sua senha.
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
                Sim. O arquivo é criptografado com AES-256-GCM antes de ser armazenado.
                Nunca pedimos sua senha e você pode revogar a sessão a qualquer momento clicando em "Remover".
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
                mudar sua senha. O RadarOne avisará quando for necessário.
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  Como gerar o Arquivo de Sessão?
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                Clique no botão "Conectar conta" acima. O assistente mostrará duas opções:
                gerar automaticamente via terminal (recomendado) ou usar uma extensão de navegador.
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </Box>
      </VStack>

      {/* Connection Wizard Modal */}
      {wizardSite && (
        <ConnectionWizard
          isOpen={isWizardOpen}
          onClose={onWizardClose}
          siteName={wizardSite.name}
          siteId={wizardSite.id}
          onUploadSuccess={fetchSessions}
          serverUnavailable={!!fetchError}
        />
      )}
    </Box>
  );
}
