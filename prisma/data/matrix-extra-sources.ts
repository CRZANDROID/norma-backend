import { DAILY_WEEKDAYS, THRICE_WEEKDAYS } from './state-congresses';

/**
 * Fuentes de la matriz operativa que no son congresos estatales.
 * INACTIVE = catálogo listo; S5 no las crawlea hasta tener conector.
 */
export const MATRIX_EXTRA_SOURCES = [
  {
    code: 'senado-gaceta',
    name: 'Gaceta del Senado',
    url: 'https://www.senado.gob.mx/66/gaceta_del_senado',
    scheduleWeekdays: DAILY_WEEKDAYS,
    sections: [
      ['Iniciativas'],
      ['Dictámenes'],
      ['Minutas'],
      ['Proposiciones'],
      ['Turnos a comisión'],
    ],
    keywordsGuide: [
      'salud',
      'alimentos',
      'bebidas',
      'publicidad',
      'niñez',
      'consumo',
      'impuestos',
      'envases',
      'residuos',
    ],
    searchFocus:
      'Iniciativas nuevas y seguimiento a minutas o dictámenes provenientes de Cámara de Diputados',
    notes: 'Matriz operativa #3. INACTIVE hasta conector S5.',
    status: 'INACTIVE' as const,
  },
  {
    code: 'mananera-presidencia',
    name: 'Conferencia matutina — Presidencia',
    url: 'https://www.gob.mx/presidencia/es/archivo/articulos',
    scheduleWeekdays: DAILY_WEEKDAYS,
    sections: [['Versión estenográfica']],
    keywordsGuide: [
      'refrescos',
      'comida chatarra',
      'obesidad',
      'diabetes',
      'escuelas',
      'COFEPRIS',
      'PROFECO',
      'etiquetado',
      'precios',
      'canasta básica',
    ],
    searchFocus:
      'Declaraciones, anuncios, instrucciones a dependencias o posicionamientos sobre salud, alimentos, bebidas, escuelas, impuestos o regulación',
    notes: 'Matriz operativa #6. INACTIVE hasta conector S5.',
    status: 'INACTIVE' as const,
  },
  {
    code: 'cofepris',
    name: 'COFEPRIS',
    url: 'https://www.gob.mx/cofepris',
    scheduleWeekdays: THRICE_WEEKDAYS,
    sections: [['Comunicados'], ['Alertas'], ['Lineamientos']],
    keywordsGuide: [
      'COFEPRIS',
      'verificación',
      'etiquetado',
      'publicidad',
      'alimentos',
      'bebidas',
      'aditivos',
      'NOM',
    ],
    searchFocus:
      'Criterios regulatorios, campañas, verificaciones, alertas o publicaciones vinculadas al sector',
    notes: 'Matriz operativa #10 (autoridades). Crawl HTTP genérico de gob.mx.',
    status: 'INACTIVE' as const,
  },
  {
    code: 'conamer',
    name: 'CONAMER — Comisión Nacional de Mejora Regulatoria',
    url: 'https://www.gob.mx/conamer',
    scheduleWeekdays: THRICE_WEEKDAYS,
    sections: [['Comunicados'], ['Anteproyectos'], ['Consultas públicas']],
    keywordsGuide: [
      'CONAMER',
      'mejora regulatoria',
      'AIR',
      'MIR',
      'anteproyecto',
      'consulta pública',
      'trámites',
      'impacto regulatorio',
    ],
    searchFocus:
      'Anteproyectos, análisis de impacto, consultas públicas o acuerdos que afecten trámites, normas o cargas al sector de bebidas y alimentos',
    notes:
      'Matriz autoridades. INACTIVE a propósito: ejemplo de capacitación (activar y rastrear).',
    status: 'INACTIVE' as const,
  },
  {
    code: 'profeco',
    name: 'PROFECO',
    url: 'https://www.gob.mx/profeco',
    scheduleWeekdays: THRICE_WEEKDAYS,
    sections: [['Comunicados'], ['Alertas'], ['Campañas']],
    keywordsGuide: [
      'PROFECO',
      'consumidor',
      'etiquetado',
      'publicidad',
      'alimentos',
      'bebidas',
      'precios',
    ],
    searchFocus:
      'Campañas, verificaciones, alertas o criterios que afecten cumplimiento, publicidad o reputación',
    notes: 'Matriz operativa #10 (autoridades). INACTIVE hasta conector S5.',
    status: 'INACTIVE' as const,
  },
];
