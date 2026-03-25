import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Heading,
  VStack,
  HStack,
  Card,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  IconButton,
  Text,
  Input,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  Badge,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api, BASE_URL } from '../services/api';
import { getToken } from '../lib/auth';

interface AppleReference {
  id: string;
  model: string;
  storage: string;
  referencePrice: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminAppleReferencePage() {
  const [refs, setRefs] = useState<AppleReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit modal
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editItem, setEditItem] = useState<AppleReference | null>(null);
  const [editModel, setEditModel] = useState('');
  const [editStorage, setEditStorage] = useState('');
  const [editPrice, setEditPrice] = useState(0);

  const fetchRefs = useCallback(async () => {
    try {
      setLoading(true);
      const token = getToken();
      const data = await api.get<AppleReference[]>('/admin/apple-references', token);
      setRefs(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load references');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRefs();
  }, [fetchRefs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${BASE_URL}/admin/apple-references/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Upload realizado!',
          description: `Criados: ${result.created}, Atualizados: ${result.updated}`,
          status: 'success',
          duration: 5000,
        });
        fetchRefs();
      } else {
        toast({
          title: 'Erro no upload',
          description: result.error || 'Falha ao processar arquivo',
          status: 'error',
          duration: 5000,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEdit = (item: AppleReference) => {
    setEditItem(item);
    setEditModel(item.model);
    setEditStorage(item.storage);
    setEditPrice(item.referencePrice);
    onOpen();
  };

  const handleSave = async () => {
    if (!editItem) return;
    try {
      const token = getToken();
      await api.put(`/admin/apple-references/${editItem.id}`, {
        model: editModel,
        storage: editStorage,
        referencePrice: editPrice,
      }, token);
      toast({ title: 'Atualizado!', status: 'success', duration: 3000 });
      onClose();
      fetchRefs();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, status: 'error', duration: 5000 });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta referência?')) return;
    try {
      const token = getToken();
      await api.delete(`/admin/apple-references/${id}`, token);
      toast({ title: 'Excluído!', status: 'success', duration: 3000 });
      fetchRefs();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, status: 'error', duration: 5000 });
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(price);

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between">
          <Heading size="lg">Referência de Preços Apple</Heading>
          <HStack>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              display="none"
              onChange={handleUpload}
            />
            <Button
              colorScheme="green"
              isLoading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Excel
            </Button>
          </HStack>
        </HStack>

        <Text color="gray.500" fontSize="sm">
          Tabela de referência para avaliação de preço de produtos Apple. O sistema usa estes valores para comparar com anúncios encontrados.
        </Text>

        {error && (
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        )}

        {loading ? (
          <Center py={10}><Spinner size="xl" /></Center>
        ) : (
          <Card>
            <CardBody p={0}>
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th>Modelo</Th>
                    <Th>Armazenamento</Th>
                    <Th isNumeric>Preço Referência</Th>
                    <Th>Ações</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {refs.map((ref) => (
                    <Tr key={ref.id}>
                      <Td fontWeight="medium">{ref.model}</Td>
                      <Td><Badge>{ref.storage}</Badge></Td>
                      <Td isNumeric fontWeight="bold" color="green.600">{formatPrice(ref.referencePrice)}</Td>
                      <Td>
                        <HStack spacing={1}>
                          <Button size="xs" onClick={() => handleEdit(ref)}>Editar</Button>
                          <Button size="xs" colorScheme="red" variant="ghost" onClick={() => handleDelete(ref.id)}>Excluir</Button>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                  {refs.length === 0 && (
                    <Tr>
                      <Td colSpan={4} textAlign="center" color="gray.500" py={8}>
                        Nenhuma referência cadastrada. Faça upload de uma planilha Excel.
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </CardBody>
          </Card>
        )}

        <Text color="gray.400" fontSize="xs">
          Total: {refs.length} referências
        </Text>
      </VStack>

      {/* Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Editar Referência</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel>Modelo</FormLabel>
                <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel>Armazenamento</FormLabel>
                <Input value={editStorage} onChange={(e) => setEditStorage(e.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel>Preço Referência (R$)</FormLabel>
                <NumberInput value={editPrice} onChange={(_, val) => setEditPrice(val)}>
                  <NumberInputField />
                </NumberInput>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={handleSave}>Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
}
