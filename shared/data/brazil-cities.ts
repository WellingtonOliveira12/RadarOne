/**
 * Brazilian cities dataset — organized by state code (UF).
 *
 * Includes all state capitals + cities with population > ~50k.
 * Names preserve accents for display.
 * Sorted alphabetically within each state.
 *
 * Architecture note: This file is imported LAZILY by the frontend
 * via dynamic import. The hook `useLocationData` abstracts this,
 * making it trivial to swap to an API endpoint in the future.
 */

export const BRAZIL_CITIES: Record<string, string[]> = {
  AC: [
    'Cruzeiro do Sul', 'Feijó', 'Rio Branco', 'Sena Madureira', 'Tarauacá',
  ],
  AL: [
    'Arapiraca', 'Coruripe', 'Delmiro Gouveia', 'Maceió', 'Marechal Deodoro',
    'Palmeira dos Índios', 'Penedo', 'Rio Largo', 'São Miguel dos Campos',
    'União dos Palmares',
  ],
  AM: [
    'Coari', 'Itacoatiara', 'Manacapuru', 'Manaus', 'Maués', 'Parintins',
    'São Gabriel da Cachoeira', 'Tabatinga', 'Tefé',
  ],
  AP: [
    'Laranjal do Jari', 'Macapá', 'Mazagão', 'Oiapoque', 'Santana',
  ],
  BA: [
    'Alagoinhas', 'Barreiras', 'Camaçari', 'Candeias', 'Casa Nova',
    'Conceição do Coité', 'Cruz das Almas', 'Dias d\'Ávila', 'Eunápolis',
    'Feira de Santana', 'Guanambi', 'Ilhéus', 'Irecê', 'Itabuna',
    'Itamaraju', 'Itapetinga', 'Jacobina', 'Jequié', 'Juazeiro',
    'Lauro de Freitas', 'Luís Eduardo Magalhães', 'Paulo Afonso',
    'Porto Seguro', 'Salvador', 'Santa Maria da Vitória', 'Santo Amaro',
    'Santo Antônio de Jesus', 'São Félix', 'Serrinha', 'Simões Filho',
    'Teixeira de Freitas', 'Valença', 'Vitória da Conquista',
  ],
  CE: [
    'Aquiraz', 'Barbalha', 'Canindé', 'Caucaia', 'Crato', 'Eusébio',
    'Fortaleza', 'Horizonte', 'Iguatu', 'Itapipoca', 'Juazeiro do Norte',
    'Maracanaú', 'Maranguape', 'Pacajus', 'Pacatuba', 'Quixadá',
    'Quixeramobim', 'Sobral', 'Tianguá',
  ],
  DF: [
    'Brasília', 'Ceilândia', 'Gama', 'Planaltina', 'Samambaia',
    'Santa Maria', 'São Sebastião', 'Sobradinho', 'Taguatinga',
  ],
  ES: [
    'Aracruz', 'Cachoeiro de Itapemirim', 'Cariacica', 'Colatina',
    'Guarapari', 'Linhares', 'São Mateus', 'Serra', 'Vila Velha', 'Vitória',
  ],
  GO: [
    'Águas Lindas de Goiás', 'Anápolis', 'Aparecida de Goiânia',
    'Caldas Novas', 'Catalão', 'Cidade Ocidental', 'Formosa', 'Goianésia',
    'Goiânia', 'Inhumas', 'Itumbiara', 'Jataí', 'Luziânia', 'Mineiros',
    'Novo Gama', 'Planaltina', 'Rio Verde', 'Santo Antônio do Descoberto',
    'Senador Canedo', 'Trindade', 'Valparaíso de Goiás',
  ],
  MA: [
    'Açailândia', 'Bacabal', 'Balsas', 'Caxias', 'Chapadinha', 'Codó',
    'Coroatá', 'Imperatriz', 'Paço do Lumiar', 'Santa Inês',
    'São José de Ribamar', 'São Luís', 'Timon',
  ],
  MG: [
    'Alfenas', 'Araguari', 'Araxá', 'Barbacena', 'Belo Horizonte',
    'Betim', 'Caratinga', 'Conselheiro Lafaiete', 'Contagem', 'Coronel Fabriciano',
    'Curvelo', 'Divinópolis', 'Governador Valadares', 'Ibirité', 'Ipatinga',
    'Itabira', 'Itajubá', 'Itaúna', 'Ituiutaba', 'Januária', 'João Monlevade',
    'Juiz de Fora', 'Lagoa Santa', 'Lavras', 'Manhuaçu', 'Montes Claros',
    'Muriaé', 'Nova Lima', 'Nova Serrana', 'Ouro Preto', 'Pará de Minas',
    'Paracatu', 'Passos', 'Patos de Minas', 'Patrocínio', 'Poços de Caldas',
    'Ponte Nova', 'Pouso Alegre', 'Ribeirão das Neves', 'Sabará',
    'Santa Luzia', 'São João del-Rei', 'São Sebastião do Paraíso',
    'Sete Lagoas', 'Teófilo Otoni', 'Timóteo', 'Uberaba', 'Uberlândia',
    'Unaí', 'Varginha', 'Vespasiano', 'Viçosa',
  ],
  MS: [
    'Campo Grande', 'Corumbá', 'Dourados', 'Maracaju', 'Naviraí',
    'Nova Andradina', 'Paranaíba', 'Ponta Porã', 'Sidrolândia',
    'Três Lagoas',
  ],
  MT: [
    'Alta Floresta', 'Barra do Garças', 'Cáceres', 'Colíder', 'Cuiabá',
    'Lucas do Rio Verde', 'Primavera do Leste', 'Rondonópolis', 'Sinop',
    'Sorriso', 'Tangará da Serra', 'Várzea Grande',
  ],
  PA: [
    'Abaetetuba', 'Altamira', 'Ananindeua', 'Barcarena', 'Belém',
    'Bragança', 'Breves', 'Cametá', 'Castanhal', 'Itaituba',
    'Marabá', 'Marituba', 'Paragominas', 'Parauapebas', 'Redenção',
    'Santarém', 'São Félix do Xingu', 'Tailândia', 'Tucuruí',
  ],
  PB: [
    'Bayeux', 'Cabedelo', 'Cajazeiras', 'Campina Grande', 'Guarabira',
    'João Pessoa', 'Patos', 'Santa Rita', 'Sousa',
  ],
  PE: [
    'Abreu e Lima', 'Cabo de Santo Agostinho', 'Camaragibe', 'Caruaru',
    'Garanhuns', 'Goiana', 'Igarassu', 'Jaboatão dos Guararapes',
    'Olinda', 'Paulista', 'Petrolina', 'Recife', 'Santa Cruz do Capibaribe',
    'São Lourenço da Mata', 'Serra Talhada', 'Vitória de Santo Antão',
  ],
  PI: [
    'Floriano', 'Parnaíba', 'Picos', 'Piripiri', 'Teresina',
  ],
  PR: [
    'Almirante Tamandaré', 'Apucarana', 'Arapongas', 'Araucária',
    'Campo Largo', 'Campo Mourão', 'Cascavel', 'Colombo', 'Curitiba',
    'Foz do Iguaçu', 'Francisco Beltrão', 'Guarapuava', 'Londrina',
    'Maringá', 'Paranaguá', 'Paranavaí', 'Pato Branco', 'Pinhais',
    'Ponta Grossa', 'São José dos Pinhais', 'Sarandi', 'Toledo',
    'Umuarama',
  ],
  RJ: [
    'Angra dos Reis', 'Araruama', 'Barra Mansa', 'Belford Roxo',
    'Cabo Frio', 'Campos dos Goytacazes', 'Duque de Caxias', 'Itaboraí',
    'Itaguaí', 'Itaperuna', 'Macaé', 'Magé', 'Maricá', 'Mesquita',
    'Niterói', 'Nova Friburgo', 'Nova Iguaçu', 'Petrópolis', 'Queimados',
    'Resende', 'Rio das Ostras', 'Rio de Janeiro', 'São Gonçalo',
    'São João de Meriti', 'Teresópolis', 'Volta Redonda',
  ],
  RN: [
    'Caicó', 'Ceará-Mirim', 'Currais Novos', 'Macaíba', 'Mossoró',
    'Natal', 'Parnamirim', 'São Gonçalo do Amarante', 'São José de Mipibu',
  ],
  RO: [
    'Ariquemes', 'Cacoal', 'Guajará-Mirim', 'Jaru', 'Ji-Paraná',
    'Porto Velho', 'Rolim de Moura', 'Vilhena',
  ],
  RR: [
    'Boa Vista', 'Caracaraí', 'Pacaraima', 'Rorainópolis',
  ],
  RS: [
    'Alvorada', 'Bagé', 'Bento Gonçalves', 'Cachoeirinha', 'Camaquã',
    'Campo Bom', 'Canoas', 'Caxias do Sul', 'Cruz Alta', 'Erechim',
    'Esteio', 'Farroupilha', 'Gravataí', 'Guaíba', 'Ijuí', 'Lajeado',
    'Novo Hamburgo', 'Passo Fundo', 'Pelotas', 'Porto Alegre',
    'Rio Grande', 'Santa Cruz do Sul', 'Santa Maria', 'Santana do Livramento',
    'Santo Ângelo', 'São Leopoldo', 'Sapucaia do Sul', 'Uruguaiana',
    'Vacaria', 'Venâncio Aires', 'Viamão',
  ],
  SC: [
    'Balneário Camboriú', 'Blumenau', 'Brusque', 'Caçador', 'Chapecó',
    'Concórdia', 'Criciúma', 'Florianópolis', 'Gaspar', 'Itajaí',
    'Jaraguá do Sul', 'Joinville', 'Lages', 'Navegantes', 'Palhoça',
    'Rio do Sul', 'São Bento do Sul', 'São José', 'Tubarão',
  ],
  SE: [
    'Aracaju', 'Estância', 'Itabaiana', 'Lagarto', 'Nossa Senhora do Socorro',
    'São Cristóvão', 'Tobias Barreto',
  ],
  SP: [
    'Americana', 'Araçatuba', 'Araraquara', 'Araras', 'Assis', 'Atibaia',
    'Avaré', 'Barueri', 'Bauru', 'Birigui', 'Botucatu', 'Bragança Paulista',
    'Caçapava', 'Caieiras', 'Cajamar', 'Campinas', 'Campo Limpo Paulista',
    'Caraguatatuba', 'Carapicuíba', 'Catanduva', 'Cotia', 'Cubatão',
    'Diadema', 'Embu das Artes', 'Ferraz de Vasconcelos', 'Franca',
    'Francisco Morato', 'Franco da Rocha', 'Guaratinguetá', 'Guarujá',
    'Guarulhos', 'Hortolândia', 'Indaiatuba', 'Itatiba', 'Itu',
    'Itupeva', 'Jacareí', 'Jandira', 'Jaú', 'Jundiaí', 'Limeira',
    'Lins', 'Marília', 'Mauá', 'Mogi das Cruzes', 'Mogi Guaçu',
    'Mogi Mirim', 'Osasco', 'Ourinhos', 'Pindamonhangaba',
    'Piracicaba', 'Poá', 'Praia Grande', 'Presidente Prudente',
    'Registro', 'Ribeirão Pires', 'Ribeirão Preto', 'Rio Claro',
    'Salto', 'Santa Bárbara d\'Oeste', 'Santana de Parnaíba', 'Santo André',
    'Santos', 'São Bernardo do Campo', 'São Caetano do Sul', 'São Carlos',
    'São José do Rio Preto', 'São José dos Campos', 'São Paulo',
    'São Roque', 'São Vicente', 'Sorocaba', 'Sumaré', 'Suzano',
    'Taboão da Serra', 'Taubaté', 'Valinhos', 'Vinhedo',
    'Várzea Paulista', 'Votuporanga',
  ],
  TO: [
    'Araguaína', 'Gurupi', 'Palmas', 'Paraíso do Tocantins', 'Porto Nacional',
  ],
};
