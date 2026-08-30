/**
 * Catálogo de 32 congresos locales alineado a la matriz operativa VCGA.
 * ACTIVE en el piloto: AGU, BC, BCS, Campeche, Chihuahua y Jalisco
 * (más federales `dof` y `diputados-gaceta` en seed.ts).
 */

export const CONGRESS_KEYWORDS = [
  'alimentos',
  'bebidas',
  'refrescos',
  'comida chatarra',
  'escuelas',
  'etiquetado',
  'publicidad',
  'salud',
  'obesidad',
  'diabetes',
  'PET',
  'plásticos',
  'agua',
];

/** Diario (alta prioridad en la matriz). */
export const DAILY_WEEKDAYS = [1, 2, 3, 4, 5];

/** Diario / mínimo 3 veces por semana → lun-mié-vie. */
export const THRICE_WEEKDAYS = [1, 3, 5];

export type StateCongressSeed = {
  code: string;
  name: string;
  stateCode:
    | 'AGU'
    | 'BCN'
    | 'BCS'
    | 'CAM'
    | 'CHP'
    | 'CHH'
    | 'CMX'
    | 'COA'
    | 'COL'
    | 'DUR'
    | 'GUA'
    | 'GRO'
    | 'HID'
    | 'JAL'
    | 'MEX'
    | 'MIC'
    | 'MOR'
    | 'NAY'
    | 'NLE'
    | 'OAX'
    | 'PUE'
    | 'QUE'
    | 'ROO'
    | 'SLP'
    | 'SIN'
    | 'SON'
    | 'TAB'
    | 'TAM'
    | 'TLA'
    | 'VER'
    | 'YUC'
    | 'ZAC';
  url: string;
  active: boolean;
  sections: string[][];
  weekdays: number[];
  searchFocus: string;
  notes: string;
};

function paths(label: string): string[][] {
  return label
    .split('/')
    .map((part) => [part.trim()])
    .filter((p) => p[0]);
}

export const STATE_CONGRESSES: StateCongressSeed[] = [
  {
    code: 'congreso-agu',
    name: 'Congreso de Aguascalientes',
    stateCode: 'AGU',
    url: 'https://congresoags.gob.mx/',
    active: true,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Iniciativas sobre salud, alimentos, bebidas, escuelas, residuos, agua y consumo',
    notes: 'Revisar si hay iniciativas nuevas o cambios de estatus',
  },
  {
    code: 'congreso-bcn',
    name: 'Congreso de Baja California',
    stateCode: 'BCN',
    url: 'https://www.congresobc.gob.mx/',
    active: true,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Restricciones a venta, publicidad, envases, residuos, agua, salud pública',
    notes: 'Priorizar temas de frontera, consumo y regulación sanitaria',
  },
  {
    code: 'congreso-bcs',
    name: 'Congreso de Baja California Sur',
    stateCode: 'BCS',
    url: 'https://www.cbcs.gob.mx/',
    active: true,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Salud, alimentos, bebidas, turismo, residuos, plásticos, agua',
    notes: 'Relevante por temas ambientales y turísticos',
  },
  {
    code: 'congreso-cam',
    name: 'Congreso de Campeche',
    stateCode: 'CAM',
    url: 'https://www.congresocam.gob.mx/',
    active: true,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Alimentos, bebidas, salud, escuelas, medio ambiente, residuos',
    notes: 'Revisar también exhortos',
  },
  {
    code: 'congreso-chp',
    name: 'Congreso de Chiapas',
    stateCode: 'CHP',
    url: 'https://web.congresochiapas.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Comida chatarra, salud, niñez, escuelas, bebidas azucaradas',
    notes: 'Estado sensible por temas de salud pública',
  },
  {
    code: 'congreso-chh',
    name: 'Congreso de Chihuahua',
    stateCode: 'CHH',
    url: 'https://www.congresochihuahua.gob.mx/',
    active: true,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Bebidas, alimentos, impuestos, escuelas, residuos, agua',
    notes: 'Revisar iniciativas fiscales o ambientales',
  },
  {
    code: 'congreso-cmx',
    name: 'Congreso de la Ciudad de México',
    stateCode: 'CMX',
    url: 'https://www.congresocdmx.gob.mx/',
    active: false,
    sections: paths('Gaceta parlamentaria / iniciativas / dictámenes'),
    weekdays: DAILY_WEEKDAYS,
    searchFocus:
      'Venta en escuelas, publicidad, salud, residuos, plásticos, consumo',
    notes: 'Alta prioridad por volumen legislativo e impacto mediático',
  },
  {
    code: 'congreso-coa',
    name: 'Congreso de Coahuila',
    stateCode: 'COA',
    url: 'https://www.congresocoahuila.gob.mx/coahuila/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Alimentos, bebidas, salud, residuos, agua, comercio',
    notes: 'Revisar cambios en comisiones',
  },
  {
    code: 'congreso-col',
    name: 'Congreso de Colima',
    stateCode: 'COL',
    url: 'https://congresocol.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Salud, escuelas, alimentos, bebidas, residuos, plásticos',
    notes: 'Monitorear exhortos y puntos de acuerdo',
  },
  {
    code: 'congreso-dur',
    name: 'Congreso de Durango',
    stateCode: 'DUR',
    url: 'https://congresodurango.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Bebidas, alimentos, salud, consumo, residuos, agua',
    notes: 'Revisar si hay propuestas de alcance municipal/estatal',
  },
  {
    code: 'congreso-mex',
    name: 'Congreso del Estado de México',
    stateCode: 'MEX',
    url: 'https://congresoedomex.gob.mx/',
    active: false,
    sections: paths('Gaceta parlamentaria / iniciativas / dictámenes'),
    weekdays: DAILY_WEEKDAYS,
    searchFocus:
      'Salud, escuelas, publicidad, venta, consumo, residuos, agua',
    notes: 'Alta prioridad por tamaño de mercado y actividad legislativa',
  },
  {
    code: 'congreso-gua',
    name: 'Congreso de Guanajuato',
    stateCode: 'GUA',
    url: 'https://www.congresogto.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Alimentos, bebidas, publicidad, salud, residuos, agua',
    notes: 'Relevante por consumo e industria',
  },
  {
    code: 'congreso-gro',
    name: 'Congreso de Guerrero',
    stateCode: 'GRO',
    url: 'https://congresogro.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Salud, alimentos, bebidas, escuelas, residuos, plásticos',
    notes: 'Revisar puntos de acuerdo',
  },
  {
    code: 'congreso-hid',
    name: 'Congreso de Hidalgo',
    stateCode: 'HID',
    url: 'https://congresohidalgo.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Salud pública, bebidas, alimentos, escuelas, consumo',
    notes: 'Vigilar iniciativas sobre niñez y salud',
  },
  {
    code: 'jalisco-congreso',
    name: 'Congreso de Jalisco',
    stateCode: 'JAL',
    url: 'https://www.congresojal.gob.mx/',
    active: true,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: DAILY_WEEKDAYS,
    searchFocus:
      'Bebidas, alimentos, publicidad, salud, residuos, agua, comercio',
    notes: 'Alta prioridad por tamaño económico y actividad legislativa',
  },
  {
    code: 'congreso-mic',
    name: 'Congreso de Michoacán',
    stateCode: 'MIC',
    url: 'https://congresomich.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Salud, alimentos, bebidas, escuelas, consumo, residuos',
    notes: 'Revisar exhortos y dictámenes',
  },
  {
    code: 'congreso-mor',
    name: 'Congreso de Morelos',
    stateCode: 'MOR',
    url: 'https://congresomorelos.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Bebidas, alimentos, salud, niñez, escuelas, residuos',
    notes: 'Monitorear temas de salud y consumo',
  },
  {
    code: 'congreso-nay',
    name: 'Congreso de Nayarit',
    stateCode: 'NAY',
    url: 'https://congresonayarit.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Salud, alimentos, bebidas, residuos, agua, turismo',
    notes: 'Relevante por temas ambientales',
  },
  {
    code: 'congreso-nle',
    name: 'Congreso de Nuevo León',
    stateCode: 'NLE',
    url: 'https://www.hcnl.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: DAILY_WEEKDAYS,
    searchFocus: 'Bebidas, alimentos, impuestos, agua, industria, residuos',
    notes: 'Alta prioridad por operación industrial y temas de agua',
  },
  {
    code: 'congreso-oax',
    name: 'Congreso de Oaxaca',
    stateCode: 'OAX',
    url: 'https://www.congresooaxaca.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: DAILY_WEEKDAYS,
    searchFocus:
      'Comida chatarra, escuelas, salud, niñez, bebidas azucaradas',
    notes: 'Alta prioridad por antecedentes de restricciones a comida chatarra',
  },
  {
    code: 'congreso-pue',
    name: 'Congreso de Puebla',
    stateCode: 'PUE',
    url: 'https://www.congresopuebla.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Alimentos, bebidas, salud, escuelas, publicidad, residuos',
    notes: 'Relevante por tamaño de mercado',
  },
  {
    code: 'congreso-que',
    name: 'Congreso de Querétaro',
    stateCode: 'QUE',
    url: 'https://legislaturaqueretaro.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Bebidas, alimentos, industria, consumo, residuos, agua',
    notes: 'Vigilar temas empresariales y ambientales',
  },
  {
    code: 'congreso-roo',
    name: 'Congreso de Quintana Roo',
    stateCode: 'ROO',
    url: 'https://www.congresoqroo.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Alimentos, bebidas, turismo, residuos, plásticos, consumo',
    notes: 'Relevante por turismo y regulación ambiental',
  },
  {
    code: 'congreso-slp',
    name: 'Congreso de San Luis Potosí',
    stateCode: 'SLP',
    url: 'https://congresosanluis.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Bebidas, alimentos, salud, industria, residuos, agua',
    notes: 'Vigilar temas industriales y ambientales',
  },
  {
    code: 'congreso-sin',
    name: 'Congreso de Sinaloa',
    stateCode: 'SIN',
    url: 'https://www.congresosinaloa.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Salud, alimentos, bebidas, escuelas, consumo, residuos',
    notes: 'Monitorear iniciativas de salud pública',
  },
  {
    code: 'congreso-son',
    name: 'Congreso de Sonora',
    stateCode: 'SON',
    url: 'https://congresoson.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Bebidas, alimentos, salud, agua, residuos, impuestos',
    notes: 'Relevante por agua y frontera',
  },
  {
    code: 'congreso-tab',
    name: 'Congreso de Tabasco',
    stateCode: 'TAB',
    url: 'https://congresotabasco.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Salud, alimentos, bebidas, consumo, residuos, agua',
    notes: 'Revisar puntos de acuerdo',
  },
  {
    code: 'congreso-tam',
    name: 'Congreso de Tamaulipas',
    stateCode: 'TAM',
    url: 'https://www.congresotamaulipas.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Bebidas, alimentos, comercio, frontera, residuos, agua',
    notes: 'Priorizar temas de comercio y frontera',
  },
  {
    code: 'congreso-tla',
    name: 'Congreso de Tlaxcala',
    stateCode: 'TLA',
    url: 'https://congresodetlaxcala.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Salud, alimentos, bebidas, escuelas, niñez, consumo',
    notes: 'Vigilar temas escolares y salud',
  },
  {
    code: 'congreso-ver',
    name: 'Congreso de Veracruz',
    stateCode: 'VER',
    url: 'https://www.legisver.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / dictámenes'),
    weekdays: DAILY_WEEKDAYS,
    searchFocus: 'Bebidas, alimentos, salud, agua, residuos, comercio',
    notes: 'Alta prioridad por tamaño de mercado',
  },
  {
    code: 'congreso-yuc',
    name: 'Congreso de Yucatán',
    stateCode: 'YUC',
    url: 'https://www.congresoyucatan.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / comisiones'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus: 'Salud, alimentos, bebidas, turismo, residuos, agua',
    notes: 'Relevante por turismo y medio ambiente',
  },
  {
    code: 'congreso-zac',
    name: 'Congreso de Zacatecas',
    stateCode: 'ZAC',
    url: 'https://www.congresozac.gob.mx/',
    active: false,
    sections: paths('Gaceta / iniciativas / orden del día'),
    weekdays: THRICE_WEEKDAYS,
    searchFocus:
      'Bebidas, alimentos, salud, escuelas, consumo, residuos, agua',
    notes: 'Revisar gaceta y asuntos turnados, no solo boletines',
  },
];
