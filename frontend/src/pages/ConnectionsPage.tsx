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
  ArrowLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { AppLayout } from '../components/AppLayout';
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

// ============================================================
// CONFIGURAÇÃO POR PROVIDER
// ============================================================

export interface ProviderConfig {
  providerKey: string;
  displayName: string;
  requiredDomains: string[];       // domínios esperados nos cookies
  loginUrl: string;                // URL onde o usuário faz login
  playwrightCommand: string;       // comando Playwright para gerar sessão
}

// eslint-disable-next-line react-refresh/only-export-components
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  MERCADO_LIVRE: {
    providerKey: 'MERCADO_LIVRE',
    displayName: 'Mercado Livre',
    requiredDomains: ['mercadolivre', 'mercadolibre'],
    loginUrl: 'mercadolivre.com.br',
    playwrightCommand: 'npx playwright codegen mercadolivre.com.br --save-storage=sessao.json',
  },
  FACEBOOK_MARKETPLACE: {
    providerKey: 'FACEBOOK_MARKETPLACE',
    displayName: 'Facebook Marketplace',
    requiredDomains: ['facebook.com'],
    loginUrl: 'facebook.com',
    playwrightCommand: 'npx playwright codegen facebook.com --save-storage=sessao.json',
  },
};

/** Helper: retorna config do provider ou fallback para ML (compatibilidade) */
function getProviderConfig(siteId: string): ProviderConfig {
  return PROVIDER_CONFIGS[siteId] || PROVIDER_CONFIGS.MERCADO_LIVRE;
}

/**
 * Valida e normaliza o arquivo de sessão.
 * Aceita 2 formatos:
 *   1) Playwright storageState: { cookies: [...], origins: [...] }
 *   2) Cookie dump (array puro): [ { domain, name, value, ... }, ... ]
 * Retorna o JSON normalizado para storageState (o formato que o backend aceita).
 *
 * @param content - conteúdo do arquivo JSON
 * @param requiredDomains - substrings de domínio exigidas (ex: ['mercadolivre', 'mercadolibre'])
 * @param providerDisplayName - nome do provider para mensagens de erro (ex: 'Mercado Livre')
 * @param loginUrl - URL de login para mensagens de erro (ex: 'mercadolivre.com.br')
 */
// eslint-disable-next-line react-refresh/only-export-components
export function validateAndNormalizeSessionFile(
  content: string,
  requiredDomains?: string[],
  providerDisplayName?: string,
  loginUrl?: string,
): {
  valid: boolean;
  error?: string;
  cookiesCount?: number;
  normalized?: string;
} {
  // Defaults para compatibilidade (ML) — caso chamado sem params
  const domains = requiredDomains || ['mercadolivre', 'mercadolibre'];
  const displayName = providerDisplayName || 'Mercado Livre';
  const url = loginUrl || 'mercadolivre.com.br';

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { valid: false, error: 'Este arquivo não é um JSON válido. Verifique se exportou corretamente.' };
  }

  const matchesDomain = (cookieDomain: string | undefined) =>
    cookieDomain ? domains.some(d => cookieDomain.includes(d)) : false;

  // Formato 2: cookie dump (array puro) → normalizar para storageState
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { valid: false, error: `O arquivo está vazio (nenhum cookie encontrado). Faça login no ${displayName} primeiro.` };
    }
    const hasProvider = data.some((c: Record<string, unknown>) => matchesDomain(c.domain as string | undefined));
    if (!hasProvider) {
      return {
        valid: false,
        error: `Nenhum cookie do ${displayName} encontrado neste arquivo. Certifique-se de exportar após fazer login no ${url}.`,
      };
    }
    const normalized = JSON.stringify({ cookies: data, origins: [] });
    return { valid: true, cookiesCount: data.length, normalized };
  }

  // Formato 1: storageState { cookies, origins }
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Formato não reconhecido. O arquivo deve ser um JSON de sessão (.json).' };
  }

  const storageState = data as Record<string, unknown>;

  if (!storageState.cookies || !Array.isArray(storageState.cookies)) {
    return { valid: false, error: 'Arquivo inválido: campo "cookies" não encontrado. Verifique se exportou o arquivo correto.' };
  }

  if (!Array.isArray(storageState.origins)) {
    // Tolerante: se não tem origins, cria vazio
    storageState.origins = [];
  }

  if (storageState.cookies.length === 0) {
    return { valid: false, error: `Nenhum cookie encontrado no arquivo. Faça login no ${displayName} antes de exportar.` };
  }

  const providerCookies = (storageState.cookies as Record<string, unknown>[]).filter((c: Record<string, unknown>) => matchesDomain(c.domain as string | undefined));

  if (providerCookies.length === 0) {
    return {
      valid: false,
      error: `Nenhum cookie do ${displayName} encontrado neste arquivo. Certifique-se de exportar após fazer login no ${url}.`,
    };
  }

  const normalized = JSON.stringify({ cookies: storageState.cookies, origins: storageState.origins || [] });
  return { valid: true, cookiesCount: (storageState.cookies as unknown[]).length, normalized };
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
  const { t } = useTranslation();
  const config: Record<string, { colorScheme: string; icon: LucideIcon }> = {
    ACTIVE: { colorScheme: 'green', icon: CheckCircle },
    NEEDS_REAUTH: { colorScheme: 'orange', icon: AlertTriangle },
    EXPIRED: { colorScheme: 'red', icon: XCircle },
    INVALID: { colorScheme: 'red', icon: XCircle },
    NOT_CONNECTED: { colorScheme: 'gray', icon: LinkIcon },
  };

  const { colorScheme, icon } = config[status] || config.NOT_CONNECTED;
  const labelKeys: Record<string, string> = {
    ACTIVE: 'connections.status.connected',
    NEEDS_REAUTH: 'connections.status.needsReauth',
    EXPIRED: 'connections.status.expired',
    INVALID: 'connections.status.invalid',
  };

  return (
    <Badge colorScheme={colorScheme} display="flex" alignItems="center" gap={1}>
      <Icon as={icon} boxSize={3} />
      {t(labelKeys[status] || 'connections.status.notConnected')}
    </Badge>
  );
}

function ExpirationCountdown({ expiresAt }: { expiresAt: string | null }) {
  const { t } = useTranslation();
  const daysLeft = getDaysUntilExpiration(expiresAt);
  if (daysLeft === null) return null;

  const expiresLabel = daysLeft === 1
    ? t('connections.expiration.expiresIn', { days: 1 })
    : t('connections.expiration.expiresIn_plural', { days: daysLeft });

  if (daysLeft <= 0) {
    return (
      <Badge colorScheme="red" display="flex" alignItems="center" gap={1}>
        <Icon as={Clock} boxSize={3} />
        {t('connections.expiration.expired')}
      </Badge>
    );
  }

  if (daysLeft <= 3) {
    return (
      <Badge colorScheme="red" display="flex" alignItems="center" gap={1}>
        <Icon as={Clock} boxSize={3} />
        {expiresLabel}
      </Badge>
    );
  }

  if (daysLeft <= 7) {
    return (
      <Badge colorScheme="orange" display="flex" alignItems="center" gap={1}>
        <Icon as={Clock} boxSize={3} />
        {expiresLabel}
      </Badge>
    );
  }

  return (
    <Text fontSize="xs" color="gray.500">
      {expiresLabel}
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
  const { t } = useTranslation();
  const providerConfig = getProviderConfig(siteId);
  const { onCopy, hasCopied } = useClipboard(providerConfig.playwrightCommand);
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
      setValidationResult({ valid: false, error: t('connections.validation.fileTooLarge') });
      setSelectedFile(file);
      return;
    }
    if (!file.name.endsWith('.json')) {
      setValidationResult({ valid: false, error: t('connections.validation.jsonOnly') });
      setSelectedFile(file);
      return;
    }
    const content = await file.text();
    const result = validateAndNormalizeSessionFile(
      content,
      providerConfig.requiredDomains,
      providerConfig.displayName,
      providerConfig.loginUrl,
    );
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
      setUploadStatus(t('connections.wizard.checkingServer'));
      try {
        await api.request('/health', { method: 'GET', timeout: 15000, skipAutoLogout: true });
      } catch {
        // Server didn't respond to health — try anyway, requestWithRetry will handle it
      }

      // Step 2: Upload
      setUploadStatus(t('connections.wizard.uploadingSession'));
      await api.requestWithRetry(`/api/sessions/${siteId}/upload`, {
        method: 'POST',
        body: { storageState: validationResult.normalized },
        skipAutoLogout: true,
      });

      toast({
        title: t('connections.wizard.successTitle'),
        description: t('connections.wizard.successDesc', { count: validationResult.cookiesCount }),
        status: 'success',
        duration: 5000,
      });
      onUploadSuccess();
      onClose();
    } catch (error: unknown) {
      // Differentiate error types for user
      let message: string;
      let details: string | undefined;

      const err = error as Record<string, unknown>;
      if (err.isNetworkError || err.errorCode === 'NETWORK_ERROR' || err.errorCode === 'NETWORK_TIMEOUT') {
        message = t('connections.errors.networkError');
        details = `Código: ${(err.errorCode as string) || 'NETWORK_ERROR'} | Tentativas: 3`;
      } else if (err.status === 401) {
        message = t('connections.errors.authExpired');
        details = `HTTP 401 — ${(err.errorCode as string) || 'INVALID_TOKEN'}`;
        setUploadError({ message, details, isAuthError: true });
        return;
      } else if (err.status === 400) {
        message = (err.message as string) || t('connections.errors.rejected');
        details = `HTTP 400 — ${(err.errorCode as string) || 'VALIDATION_ERROR'}`;
      } else if (typeof err.status === 'number' && err.status >= 500) {
        message = t('connections.errors.internalServer');
        details = `HTTP ${err.status} — ${(err.errorCode as string) || 'SERVER_ERROR'}`;
      } else {
        message = (err.message as string) || t('connections.errors.unknownUpload');
        details = err.status ? `HTTP ${err.status}` : undefined;
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
        <ModalHeader>{t('connections.wizard.title', { site: siteName })}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={5} align="stretch">
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Box fontSize="sm">
                <Text>
                  <Trans i18nKey="connections.wizard.intro" values={{ site: siteName }} components={{ strong: <strong /> }} />
                </Text>
                <Text mt={1} fontWeight="medium">
                  {t('connections.wizard.noPassword')}
                </Text>
              </Box>
            </Alert>

            <Heading size="sm">{t('connections.wizard.howToGenerate')}</Heading>

            <Tabs variant="enclosed" colorScheme="blue">
              <TabList>
                <Tab data-testid="tab-extensao">
                  <HStack spacing={1}>
                    <Icon as={FileText} boxSize={4} />
                    <Text>{t('connections.wizard.tabCookies')}</Text>
                  </HStack>
                </Tab>
                <Tab data-testid="tab-automatico">
                  <HStack spacing={1}>
                    <Icon as={Terminal} boxSize={4} />
                    <Text>{t('connections.wizard.tabAutomatic')}</Text>
                  </HStack>
                </Tab>
              </TabList>

              <TabPanels>
                {/* TAB 1: Via Cookies (Recomendado) */}
                <TabPanel px={0}>
                  <Box bg="green.50" border="1px solid" borderColor="green.200" borderRadius="md" p={2} mb={3}>
                    <HStack>
                      <Badge colorScheme="green" fontSize="xs">{t('connections.wizard.recommended')}</Badge>
                      <Text fontSize="xs" color="green.700">{t('connections.wizard.recommendedDesc')}</Text>
                    </HStack>
                  </Box>
                  <VStack align="start" spacing={3}>
                    <Box>
                      <Text fontWeight="medium" fontSize="sm" mb={1}>{t('connections.wizard.step1Cookies')}</Text>
                      <Text fontSize="xs" color="gray.500" mb={2}>
                        {t('connections.wizard.step1CookiesHint')}
                      </Text>
                      <VStack align="start" spacing={1} pl={3}>
                        <a
                          href="https://chromewebstore.google.com/detail/export-cookie-json-file-f/nmckokihipjgplolmcmjakknndddifde?hl=en"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '13px', color: '#3182ce', textDecoration: 'underline' }}
                        >
                          Export Cookie JSON File
                        </a>
                        <a
                          href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm?hl=en"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '13px', color: '#3182ce', textDecoration: 'underline' }}
                        >
                          Cookie Editor
                        </a>
                        <a
                          href="https://chromewebstore.google.com/detail/editthiscookie-v3/ojfebgpkimhlhcblbalbfjblapadhbol"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '13px', color: '#3182ce', textDecoration: 'underline' }}
                        >
                          EditThisCookie
                        </a>
                      </VStack>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">{t('connections.wizard.step2Cookies', { url: providerConfig.loginUrl })}</Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">{t('connections.wizard.step3Cookies')}</Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">{t('connections.wizard.step4Cookies')}</Text>
                    </Box>
                  </VStack>
                </TabPanel>

                {/* TAB 2: Automático (Alternativa) */}
                <TabPanel px={0}>
                  <VStack align="start" spacing={3}>
                    <Text fontSize="sm" color="gray.600">
                      {t('connections.wizard.autoDesc')}
                    </Text>

                    <Box w="100%">
                      <Text fontWeight="medium" fontSize="sm" mb={1}>{t('connections.wizard.step1Auto')}</Text>
                      <HStack
                        bg="gray.50"
                        border="1px solid"
                        borderColor="gray.200"
                        borderRadius="md"
                        p={3}
                        justify="space-between"
                      >
                        <Code fontSize="xs" bg="transparent" wordBreak="break-all" data-testid="playwright-command">
                          {providerConfig.playwrightCommand}
                        </Code>
                        <Button
                          size="xs"
                          leftIcon={hasCopied ? <Check size={12} /> : <Copy size={12} />}
                          onClick={onCopy}
                          colorScheme={hasCopied ? 'green' : 'gray'}
                          flexShrink={0}
                          data-testid="copy-command-btn"
                        >
                          {hasCopied ? t('connections.wizard.copied') : t('connections.wizard.copy')}
                        </Button>
                      </HStack>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">{t('connections.wizard.step2Auto', { site: providerConfig.displayName })}</Text>
                      <Text fontSize="xs" color="gray.500">{t('connections.wizard.step2AutoHint')}</Text>
                    </Box>

                    <Box>
                      <Text fontWeight="medium" fontSize="sm">
                        <Trans i18nKey="connections.wizard.step3Auto" components={{ code: <code /> }} />
                      </Text>
                    </Box>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>

            {/* UPLOAD AREA */}
            <Divider />
            <Heading size="sm">{t('connections.wizard.uploadTitle')}</Heading>

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
                      <Badge colorScheme="green">{t('connections.wizard.cookiesFound', { count: validationResult.cookiesCount })}</Badge>
                    )}
                  </>
                ) : (
                  <>
                    <Text fontSize="sm" color="gray.500">
                      {t('connections.wizard.dropHint')}
                    </Text>
                    <Text fontSize="xs" color="gray.400">
                      {t('connections.wizard.maxSize')}
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
                  <AlertTitle>{t('connections.wizard.invalidFile')}</AlertTitle>
                  <AlertDescription>{validationResult.error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {/* Server unavailable warning */}
            {serverUnavailable && !uploadError && (
              <Alert status="warning" borderRadius="md" data-testid="server-warning">
                <AlertIcon />
                <Box fontSize="sm">
                  <AlertTitle>{t('connections.wizard.serverStarting')}</AlertTitle>
                  <AlertDescription>
                    {t('connections.wizard.serverStartingDesc')}
                  </AlertDescription>
                </Box>
              </Alert>
            )}

            {/* Upload error (inline, with retry or re-login) */}
            {uploadError && (
              <Alert status={uploadError.isAuthError ? 'warning' : 'error'} borderRadius="md" data-testid="upload-error">
                <AlertIcon />
                <Box fontSize="sm" flex="1">
                  <AlertTitle>{uploadError.isAuthError ? t('connections.wizard.sessionExpired') : t('connections.wizard.uploadError')}</AlertTitle>
                  <AlertDescription>{uploadError.message}</AlertDescription>
                  {uploadError.details && (
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      {t('connections.wizard.technicalDetails', { details: uploadError.details })}
                    </Text>
                  )}
                  {uploadError.isAuthError && (
                    <Button
                      size="sm"
                      colorScheme="orange"
                      mt={2}
                      onClick={() => { window.location.href = '/login?reason=session_expired'; }}
                    >
                      {t('connections.wizard.doLogin')}
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
              {t('connections.wizard.cancel')}
            </Button>
            <Button
              colorScheme={uploadError ? 'orange' : 'blue'}
              leftIcon={<Upload size={16} />}
              isDisabled={!validationResult?.valid}
              isLoading={isUploading}
              loadingText={uploadStatus || t('connections.wizard.sending')}
              onClick={handleSubmit}
              data-testid="submit-upload-btn"
            >
              {uploadError ? t('connections.wizard.tryAgain') : t('connections.wizard.submit')}
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
  const { t } = useTranslation();
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
    ? t('connections.card.reconnectNow')
    : expirationWarning
    ? t('connections.card.renewSession')
    : session
    ? t('connections.card.updateSession')
    : t('connections.card.connectAccount');

  return (
    <Card variant="outline" borderColor={getBorderColor()} bg={getBgColor()}>
      <CardHeader pb={2}>
        <HStack justify="space-between">
          <VStack align="start" spacing={0}>
            <HStack>
              <Heading size="md">{site.name}</Heading>
              <Badge colorScheme="purple" fontSize="xs" display="flex" alignItems="center" gap={1}>
                <Icon as={Shield} boxSize={3} />
                {t('connections.requiresLogin')}
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
                <Text>{t('connections.card.cookies')}</Text>
                <Text fontWeight="medium">{session.cookiesCount}</Text>
              </HStack>
              <ExpirationCountdown expiresAt={session.expiresAt} />
            </HStack>
            {session.lastUsedAt && (
              <HStack fontSize="sm" color="gray.600">
                <Text>{t('connections.card.lastUsed')}</Text>
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
                {daysLeft <= 3 ? t('connections.card.expiresVerySoon') : t('connections.card.expiresSoon')}
              </AlertTitle>
              <AlertDescription fontSize="xs">
                {daysLeft <= 1
                  ? t('connections.card.expiresRecommendNow')
                  : t('connections.card.expiresRecommendSoon', { days: daysLeft })}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {needsAction && (
          <Alert status="warning" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">{t('connections.card.actionRequired')}</AlertTitle>
              <AlertDescription fontSize="xs">
                {session.status === 'NEEDS_REAUTH'
                  ? t('connections.card.needsReauthDesc')
                  : session.status === 'EXPIRED'
                  ? t('connections.card.expiredDesc')
                  : t('connections.card.invalidDesc')}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {!session && (
          <Alert status="info" mb={4} borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="sm">{t('connections.card.connectTitle')}</AlertTitle>
              <AlertDescription fontSize="xs">
                {t('connections.card.connectDesc', { site: site.name })}
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
              {t('connections.card.remove')}
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
  {
    id: 'FACEBOOK_MARKETPLACE',
    name: 'Facebook Marketplace',
    domains: ['facebook.com'],
  },
];

export default function ConnectionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      let description = t('connections.errors.unknown');
      if (err.isNetworkError || err.isColdStart) {
        description = t('connections.errors.serverUnavailable');
      } else if (err.status === 401) {
        description = t('connections.errors.sessionExpired');
        setIsSessionExpired(true);
      } else if (typeof err.status === 'number' && err.status >= 500) {
        description = t('connections.errors.serverError');
      } else if (err.status === 404) {
        description = t('connections.errors.notFound');
      } else if (err.message) {
        description = err.message as string;
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
      toast({ title: t('connections.errors.deleteSuccess'), status: 'success', duration: 3000 });
      fetchSessions();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: t('connections.errors.deleteError'),
        description: message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const getSessionForSite = (siteId: string) =>
    sessions.find((s) => s.site === siteId) || null;

  if (loading) {
    return (
      <AppLayout>
        <Box display="flex" justifyContent="center" alignItems="center" minH="50vh">
          <Spinner size="xl" />
        </Box>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
    <Box maxW="800px" mx="auto" py={8} px={4}>
      <VStack spacing={6} align="stretch">
        {/* Back to monitors */}
        <Button
          leftIcon={<ArrowLeft size={16} />}
          variant="ghost"
          size="sm"
          alignSelf="flex-start"
          onClick={() => navigate('/monitors')}
        >
          {t('connections.backToMonitors')}
        </Button>

        {/* Header */}
        <HStack justify="space-between">
          <VStack align="start" spacing={1}>
            <Heading size="lg">{t('connections.title')}</Heading>
            <Text color="gray.600">
              {t('connections.subtitle')}
            </Text>
          </VStack>
          <Button
            leftIcon={<RefreshCw size={16} />}
            variant="outline"
            size="sm"
            onClick={fetchSessions}
          >
            {t('connections.refresh')}
          </Button>
        </HStack>

        <Divider />

        {(() => {
          const problemSessions = sessions.filter((s) =>
            ['NEEDS_REAUTH', 'INVALID', 'EXPIRED'].includes(s.status)
          );
          if (problemSessions.length === 0) return null;
          return (
            <Alert status="warning" borderRadius="md">
              <AlertIcon />
              <Box>
                <AlertTitle>
                  {t('connections.alerts.needsAttentionCount', { count: problemSessions.length })}
                </AlertTitle>
                <AlertDescription>
                  {t('connections.alerts.needsAttentionDesc')}
                </AlertDescription>
              </Box>
            </Alert>
          );
        })()}

        {fetchError && (
          <Alert status={isSessionExpired ? 'warning' : 'error'} borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>{isSessionExpired ? t('connections.wizard.sessionExpired') : t('connections.errors.loadError')}</AlertTitle>
              <AlertDescription>{fetchError}</AlertDescription>
            </Box>
            {isSessionExpired ? (
              <Button
                size="sm"
                colorScheme="orange"
                onClick={() => { window.location.href = '/login?reason=session_expired'; }}
                ml={2}
              >
                {t('connections.wizard.doLogin')}
              </Button>
            ) : (
              <Button size="sm" colorScheme="red" variant="outline" onClick={fetchSessions} ml={2}>
                {t('connections.wizard.tryAgain')}
              </Button>
            )}
          </Alert>
        )}

        {/* Site Cards */}
        <VStack spacing={4} align="stretch">
          {effectiveSites
            .filter((site) => ['MERCADO_LIVRE', 'FACEBOOK_MARKETPLACE'].includes(site.id))
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
          <Heading size="md" mb={4}>{t('connections.faq.title')}</Heading>
          <Accordion allowToggle>
            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  {t('connections.faq.q1')}
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                {t('connections.faq.a1')}
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  {t('connections.faq.q2')}
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                {t('connections.faq.a2')}
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  {t('connections.faq.q3')}
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                {t('connections.faq.a3')}
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem>
              <AccordionButton>
                <Box flex="1" textAlign="left" fontWeight="medium">
                  {t('connections.faq.q4')}
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4} fontSize="sm" color="gray.600">
                {t('connections.faq.a4')}
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
    </AppLayout>
  );
}
