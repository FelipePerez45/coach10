// Datos extraídos del PDF "Planificación Nutricional - Felipe Alejandro Pérez (19_05_26)"
// Entrenador: César Fitness · Nutricionista: Mario Ocaña · @elcuerpo10

const COMIDAS = [
  { id: 'desayuno', nombre: 'Desayuno', orden: 1, lleva_vegetales: false, icono: '🌅' },
  { id: 'comida',   nombre: 'Comida',   orden: 2, lleva_vegetales: true,  icono: '🍽️' },
  { id: 'merienda', nombre: 'Merienda', orden: 3, lleva_vegetales: false, icono: '🥪' },
  { id: 'cena',     nombre: 'Cena',     orden: 4, lleva_vegetales: true,  icono: '🌙' },
];

// Cada alimento aparece en TODAS las comidas (igual en las 4) salvo vegetales (sólo en comida y cena).
// Los datos se replican lógicamente: las 4 comidas comparten el mismo catálogo.

// kcal/p_g/c_g/f_g: estimaciones aproximadas por porción (valor real puede variar ±10-15%).
// p = proteína, c = hidratos de carbono, f = grasa (gramos).
const HIDRATOS = [
  { id: 'h-cereales',        nombre: 'Cereales',                                      cantidad: 41,  unidad: 'g', kcal: 155, p_g: 3, c_g: 30, f_g: 2 },
  { id: 'h-avena',           nombre: 'Avena',                                         cantidad: 58,  unidad: 'g', kcal: 220, p_g: 9, c_g: 35, f_g: 4 },
  { id: 'h-pan-integral',    nombre: 'Pan integral',                                  cantidad: 51,  unidad: 'g', kcal: 125, p_g: 5, c_g: 22, f_g: 1 },
  { id: 'h-crema-arroz',     nombre: 'Crema de arroz',                                cantidad: 41,  unidad: 'g', kcal: 150, p_g: 3, c_g: 33, f_g: 1 },
  { id: 'h-pasta-integral',  nombre: 'Pasta integral',                                cantidad: 51,  unidad: 'g', kcal: 175, p_g: 6, c_g: 33, f_g: 2 },
  { id: 'h-arroz-integral',  nombre: 'Arroz integral',                                cantidad: 44,  unidad: 'g', kcal: 160, p_g: 3, c_g: 32, f_g: 1 },
  { id: 'h-palomitas',       nombre: 'Palomitas de maíz (sin aceite ni sal)',         cantidad: 48,  unidad: 'g', kcal: 180, p_g: 4, c_g: 33, f_g: 2 },
  { id: 'h-patata',          nombre: 'Patata',                                        cantidad: 171, unidad: 'g', kcal: 135, p_g: 3, c_g: 31, f_g: 0 },
  { id: 'h-boniato',         nombre: 'Boniato',                                       cantidad: 144, unidad: 'g', kcal: 125, p_g: 2, c_g: 29, f_g: 0 },
  { id: 'h-noodles',         nombre: 'Noodles de arroz',                              cantidad: 44,  unidad: 'g', kcal: 160, p_g: 3, c_g: 35, f_g: 0 },
  { id: 'h-quinoa',          nombre: 'Quinoa',                                        cantidad: 51,  unidad: 'g', kcal: 185, p_g: 7, c_g: 32, f_g: 3 },
  { id: 'h-cous-cous',       nombre: 'Cous Cous',                                     cantidad: 51,  unidad: 'g', kcal: 180, p_g: 6, c_g: 36, f_g: 1 },
];

const PROTEINAS = [
  { id: 'p-jamon-serrano',     nombre: 'Jamón Serrano',                                  cantidad: 112, unidad: 'g', kcal: 270, p_g: 33, c_g: 0,  f_g: 16, tags: ['carne'] },
  { id: 'p-carne-picada',      nombre: 'Carne picada ternera',                           cantidad: 176, unidad: 'g', kcal: 280, p_g: 36, c_g: 0,  f_g: 14, tags: ['carne', 'carne-roja'] },
  { id: 'p-pollo',             nombre: 'Pechuga / Muslo pollo',                          cantidad: 140, unidad: 'g', kcal: 220, p_g: 32, c_g: 0,  f_g: 9,  tags: ['carne', 'ave'] },
  { id: 'p-pavo-fiambre',      nombre: 'Pechuga Pavo (fiambre)',                         cantidad: 183, unidad: 'g', kcal: 195, p_g: 36, c_g: 2,  f_g: 3,  tags: ['carne', 'ave', 'fiambre'] },
  { id: 'p-atun-pavo',         nombre: 'Atún al natural (2 latas) + 46g Pechuga de Pavo (fiambre)', cantidad: 112, unidad: 'g', kcal: 215, p_g: 34, c_g: 1, f_g: 8, tags: ['pescado', 'combinado'], extra: '+ 46g Pechuga de Pavo' },
  { id: 'p-lomo-embuchado',    nombre: 'Lomo embuchado',                                 cantidad: 88,  unidad: 'g', kcal: 230, p_g: 30, c_g: 0,  f_g: 12, tags: ['carne', 'cerdo'] },
  { id: 'p-dorada',            nombre: 'Dorada',                                         cantidad: 176, unidad: 'g', kcal: 220, p_g: 36, c_g: 0,  f_g: 8,  tags: ['pescado', 'pescado-blanco'] },
  { id: 'p-lubina',            nombre: 'Lubina',                                         cantidad: 176, unidad: 'g', kcal: 170, p_g: 31, c_g: 0,  f_g: 5,  tags: ['pescado', 'pescado-blanco'] },
  { id: 'p-sardina',           nombre: 'Sardina fresca',                                 cantidad: 140, unidad: 'g', kcal: 290, p_g: 28, c_g: 0,  f_g: 18, tags: ['pescado', 'pescado-azul'] },
  { id: 'p-pulpo',             nombre: 'Pulpo',                                          cantidad: 176, unidad: 'g', kcal: 145, p_g: 25, c_g: 4,  f_g: 2,  tags: ['marisco'] },
  { id: 'p-lomo-cerdo',        nombre: 'Lomo de cerdo',                                  cantidad: 126, unidad: 'g', kcal: 190, p_g: 30, c_g: 0,  f_g: 8,  tags: ['carne', 'cerdo'] },
  { id: 'p-claras-huevo',      nombre: 'Claras de huevo',                                cantidad: 316, unidad: 'g', kcal: 155, p_g: 35, c_g: 2,  f_g: 0,  tags: ['huevo'] },
  { id: 'p-whey',              nombre: 'Proteína Whey',                                  cantidad: 42,  unidad: 'g', kcal: 165, p_g: 30, c_g: 4,  f_g: 3,  tags: ['suplemento'] },
  { id: 'p-jamon-cocido',      nombre: 'Jamón cocido',                                   cantidad: 176, unidad: 'g', kcal: 195, p_g: 32, c_g: 2,  f_g: 6,  tags: ['carne', 'fiambre'] },
  { id: 'p-huevos-enteros',    nombre: '3 Huevos enteros + 1ud. Clara',                  cantidad: 180, unidad: 'g', kcal: 250, p_g: 24, c_g: 1,  f_g: 16, tags: ['huevo'] },
  { id: 'p-salmon',            nombre: 'Salmón',                                         cantidad: 176, unidad: 'g', kcal: 370, p_g: 35, c_g: 0,  f_g: 24, tags: ['pescado', 'pescado-azul'] },
  { id: 'p-queso-fresco',      nombre: 'Queso fresco batido',                            cantidad: 387, unidad: 'g', kcal: 270, p_g: 50, c_g: 13, f_g: 0,  tags: ['lacteo'] },
  { id: 'p-merluza',           nombre: 'Merluza',                                        cantidad: 176, unidad: 'g', kcal: 115, p_g: 25, c_g: 0,  f_g: 2,  tags: ['pescado', 'pescado-blanco'] },
  { id: 'p-langostinos',       nombre: 'Langostinos',                                    cantidad: 7,   unidad: 'ud',kcal:  85, p_g: 17, c_g: 0,  f_g: 1,  tags: ['marisco'] },
  { id: 'p-calamar',           nombre: 'Calamar',                                        cantidad: 140, unidad: 'g', kcal: 125, p_g: 22, c_g: 4,  f_g: 2,  tags: ['marisco'] },
];

const GRASAS = [
  { id: 'g-aceite-oliva',     nombre: 'Aceite de oliva',                       cantidad: 8,  unidad: 'g', kcal:  72, p_g: 0,  c_g: 0, f_g: 8  },
  { id: 'g-mantequilla',      nombre: 'Mantequilla',                           cantidad: 9,  unidad: 'g', kcal:  65, p_g: 0,  c_g: 0, f_g: 7  },
  { id: 'g-peanut-butter',    nombre: 'Peanut Butter',                         cantidad: 16, unidad: 'g', kcal:  95, p_g: 4,  c_g: 3, f_g: 8  },
  { id: 'g-almendras-nueces', nombre: 'Almendras / Nueces',                    cantidad: 16, unidad: 'g', kcal: 100, p_g: 4,  c_g: 3, f_g: 8  },
  { id: 'g-cacahuete-mix',    nombre: 'Cacahuete / Pistacho / Avellana',       cantidad: 16, unidad: 'g', kcal: 100, p_g: 4,  c_g: 3, f_g: 8  },
  { id: 'g-queso-cabra',      nombre: 'Queso curado de cabra',                 cantidad: 22, unidad: 'g', kcal:  80, p_g: 6,  c_g: 0, f_g: 6  },
  { id: 'g-aguacate',         nombre: 'Aguacate',                              cantidad: 49, unidad: 'g', kcal:  80, p_g: 1,  c_g: 4, f_g: 7  },
  { id: 'g-aceitunas',        nombre: 'Aceitunas Verdes',                      cantidad: 37, unidad: 'g', kcal:  55, p_g: 0,  c_g: 1, f_g: 5  },
  { id: 'g-humus',            nombre: 'Humus',                                 cantidad: 33, unidad: 'g', kcal:  55, p_g: 2,  c_g: 4, f_g: 3  },
  { id: 'g-chocolate-85',     nombre: 'Chocolate negro 85%',                   cantidad: 29, unidad: 'g', kcal: 165, p_g: 3,  c_g: 7, f_g: 13 },
  { id: 'g-cacao-puro',       nombre: 'Cacao puro desgrasado',                 cantidad: 39, unidad: 'g', kcal:  85, p_g: 8,  c_g: 8, f_g: 4  },
  { id: 'g-grana-padano',     nombre: 'Queso grana padano',                    cantidad: 29, unidad: 'g', kcal: 115, p_g: 10, c_g: 0, f_g: 8  },
];

const VEGETALES = [
  { id: 'v-coliflor',     nombre: 'Coliflor',     cantidad: 100, unidad: 'g', kcal: 25, p_g: 2, c_g: 5,  f_g: 0 },
  { id: 'v-brocoli',      nombre: 'Brócoli',      cantidad: 80,  unidad: 'g', kcal: 28, p_g: 2, c_g: 5,  f_g: 0 },
  { id: 'v-tomate',       nombre: 'Tomate',       cantidad: 125, unidad: 'g', kcal: 22, p_g: 1, c_g: 5,  f_g: 0 },
  { id: 'v-pimiento',     nombre: 'Pimiento',     cantidad: 110, unidad: 'g', kcal: 22, p_g: 1, c_g: 5,  f_g: 0 },
  { id: 'v-berenjena',    nombre: 'Berenjena',    cantidad: 90,  unidad: 'g', kcal: 22, p_g: 1, c_g: 5,  f_g: 0 },
  { id: 'v-judias',       nombre: 'Judías Verdes', cantidad: 70,  unidad: 'g', kcal: 22, p_g: 1, c_g: 5,  f_g: 0 },
  { id: 'v-pepinillos',   nombre: 'Pepinillos',   cantidad: 80,  unidad: 'g', kcal:  9, p_g: 0, c_g: 2,  f_g: 0 },
  { id: 'v-espinacas',    nombre: 'Espinacas',    cantidad: 100, unidad: 'g', kcal: 23, p_g: 3, c_g: 4,  f_g: 0 },
  { id: 'v-calabacin',    nombre: 'Calabacín',    cantidad: 235, unidad: 'g', kcal: 38, p_g: 3, c_g: 8,  f_g: 0 },
  { id: 'v-cebolla',      nombre: 'Cebolla',      cantidad: 50,  unidad: 'g', kcal: 20, p_g: 1, c_g: 5,  f_g: 0 },
  { id: 'v-zanahoria',    nombre: 'Zanahoria',    cantidad: 52,  unidad: 'g', kcal: 21, p_g: 0, c_g: 5,  f_g: 0 },
  { id: 'v-puerro',       nombre: 'Puerro',       cantidad: 90,  unidad: 'g', kcal: 27, p_g: 2, c_g: 6,  f_g: 0 },
  { id: 'v-champinones',  nombre: 'Champiñones',  cantidad: 100, unidad: 'g', kcal: 22, p_g: 3, c_g: 3,  f_g: 0 },
  { id: 'v-esparragos',   nombre: 'Espárragos',   cantidad: 250, unidad: 'g', kcal: 50, p_g: 6, c_g: 10, f_g: 0 },
];

const FRUTAS = [
  { id: 'f-platano',     nombre: 'Plátano',                                       cantidad: 1,   unidad: 'ud',kcal: 105, p_g: 1, c_g: 27, f_g: 0 },
  { id: 'f-melon',       nombre: 'Melón',                                         cantidad: 150, unidad: 'g', kcal:  50, p_g: 1, c_g: 12, f_g: 0 },
  { id: 'f-fresas',      nombre: 'Fresas',                                        cantidad: 120, unidad: 'g', kcal:  38, p_g: 1, c_g:  9, f_g: 0 },
  { id: 'f-stone-fruit', nombre: 'Albaricoques / Ciruela / Melocotón',            cantidad: 100, unidad: 'g', kcal:  50, p_g: 1, c_g: 12, f_g: 0 },
  { id: 'f-mix-90',      nombre: 'Cerezas / Kiwi / Mandarina / Manzana / Naranja', cantidad: 90,  unidad: 'g', kcal:  54, p_g: 1, c_g: 13, f_g: 0 },
  { id: 'f-mix-80',      nombre: 'Arándanos / Piña',                              cantidad: 80,  unidad: 'g', kcal:  45, p_g: 1, c_g: 11, f_g: 0 },
  { id: 'f-mix-70',      nombre: 'Mango / Pera',                                  cantidad: 70,  unidad: 'g', kcal:  42, p_g: 0, c_g: 10, f_g: 0 },
  { id: 'f-uvas',        nombre: 'Uvas',                                          cantidad: 60,  unidad: 'g', kcal:  41, p_g: 0, c_g: 11, f_g: 0 },
  { id: 'f-datil',       nombre: 'Dátil',                                         cantidad: 13,  unidad: 'g', kcal:  36, p_g: 0, c_g:  9, f_g: 0 },
];

const ALIMENTOS = [
  ...HIDRATOS.map(a   => ({ ...a, grupo: 'hidrato'   })),
  ...PROTEINAS.map(a  => ({ ...a, grupo: 'proteina'  })),
  ...GRASAS.map(a     => ({ ...a, grupo: 'grasa'     })),
  ...VEGETALES.map(a  => ({ ...a, grupo: 'vegetal'   })),
  ...FRUTAS.map(a     => ({ ...a, grupo: 'fruta'     })),
];

const GRUPOS = [
  { id: 'hidrato',  nombre: 'Hidratos',  color: '#f5a623', icono: '🌾' },
  { id: 'proteina', nombre: 'Proteínas', color: '#d0021b', icono: '🍗' },
  { id: 'grasa',    nombre: 'Grasas',    color: '#f8b500', icono: '🥑' },
  { id: 'vegetal',  nombre: 'Vegetales', color: '#7ed321', icono: '🥦' },
  { id: 'fruta',    nombre: 'Frutas',    color: '#bd10e0', icono: '🍓' },
];

const EQUIVALENCIAS_COCIDO = [
  { alimento: 'Arroz',  seco: '44g',  cocido: '89g'  },
  { alimento: 'Pasta',  seco: '51g',  cocido: '102g' },
  { alimento: 'Patata', seco: '171g', cocido: '174g' },
];

const LEGUMBRES = [
  {
    base: '30g de Garbanzos',
    equivale: [
      ['20g de arroz', '20g de pollo'],
      ['23g de pan',   '25g de ternera'],
      ['77g de patata','26g de atún'],
    ],
  },
  {
    base: '26g de Lentejas',
    equivale: [
      ['20g de arroz', '20g de pollo'],
      ['23g de pan',   '25g de ternera'],
      ['77g de patata','26g de atún'],
    ],
  },
];

const RECOMENDACIONES = [
  'Los alimentos se pesarán siempre en crudo.',
  'Añadir el aceite de oliva una vez terminada la preparación del plato.',
  'Café sin contraindicaciones.',
  'Para agilizar preparaciones (patata, etc.), utilizar Lékué.',
  'Cocinar carnes y pescados siempre a la plancha.',
  'Añadir verduras al gusto en cada plato.',
  'Priorizar cereales de grano entero (integrales).',
  'Es posible repartir dos macronutrientes en la misma comida.',
];

const CONSEJOS = [
  {
    titulo: 'Pesar los alimentos',
    texto: 'Es importante al menos en las primeras semanas. No es para hacer el plan perfecto, sino para adoptar referencias visuales y, a medio/largo plazo, tener autonomía sin depender del plan semanal.',
  },
  {
    titulo: 'Intercambios permitidos',
    texto: 'Carnes blancas por blancas (cantidades similares). Pescados blancos por blancos, azules por azules. Frutos secos entre sí. Pan blanco ↔ integral sin afectar al objetivo.',
  },
  {
    titulo: 'Cuándo entrenar',
    texto: 'Mejor con la digestión hecha o en ayuno postabsortivo (2-3h desde la última comida). Evitar entrenar justo después de comer. Fines de semana sirven para compensar sedentarismo de la semana.',
  },
  {
    titulo: 'Ultraprocesados a evitar',
    texto: 'Bebidas energéticas y azucaradas, zumos comerciales, lácteos azucarados, bollería industrial, carnes procesadas, panes industriales, pizzas industriales, galletería, cereales refinados y barritas, precocinados, snacks fritos, dulces, helados, productos dietéticos, salsas comerciales, pescados procesados.',
  },
];

const FAQS = [
  {
    pregunta: 'Lechuga, ¿se podría añadir aunque no se pese?',
    respuesta: 'Sí, la lechuga se puede añadir como vegetal sin problema. No está en la columna de vegetales por tener un índice calórico muy bajo. Añade la cantidad que quieras para acompañar.',
  },
  {
    pregunta: '¿Por qué la tabla marca cantidades pero también dice "añadir verduras al gusto"?',
    respuesta: 'Las cantidades de vegetales son orientativas, una guía de ingesta "normal". Puedes variar la cantidad: tienen tan pocas calorías que no pasa nada si te pasas para crear más volumen.',
  },
  {
    pregunta: '¿Se pueden partir por mitades y coger dos de un mismo grupo?',
    respuesta: 'Sí, podemos dividir entre dos: por ejemplo, dos alimentos de proteínas y coger la mitad de cada uno para combinar más de un alimento.',
  },
  {
    pregunta: 'Si no he comido un alimento de una comida, ¿lo puedo pasar a la siguiente?',
    respuesta: 'Sí. Lo importante es que al final del día hayas consumido todas las cantidades de la planificación, independientemente de en qué comida.',
  },
  {
    pregunta: '¿Las 2 piezas de fruta son obligatorias?',
    respuesta: 'Sí, son obligatorias. Forman parte del cómputo calórico diario. Puedes consumirlas entre comidas (respetando 1,5h entre digestiones) u óptimamente en las comidas centrales.',
  },
  {
    pregunta: '¿Lácteos no se pueden comer? ¿Por qué?',
    respuesta: 'En dietas de definición la leche se deja fuera por las calorías líquidas. Aporta hidratos (el macro más bajo aquí) y un alimento sólido siempre da más saciedad que uno líquido.',
  },
  {
    pregunta: 'Si no tengo arroz/pasta integral, ¿puedo tomar blanco?',
    respuesta: 'Sí. El grano entero es más interesante (energía más larga, menor pico de glucosa), pero puntualmente puedes consumir hidrato blanco sin problema.',
  },
];

const FRECUENCIAS_SEMANALES = [
  { nutriente: 'Calcio',          alimento: 'Legumbres',     frecuencia: '2/7'    },
  { nutriente: 'Hierro y Zinc',   alimento: 'Carnes Rojas',  frecuencia: '2-3/7'  },
  { nutriente: 'Hierro y Zinc',   alimento: 'Aves',          frecuencia: '3-4/7'  },
  { nutriente: 'Hierro y Zinc',   alimento: 'Pescados',      frecuencia: '2/7'    },
  { nutriente: 'Otros',           alimento: 'Frutas',        frecuencia: '7-14/7' },
  { nutriente: 'Otros',           alimento: 'Cereales',      frecuencia: '21/7'   },
  { nutriente: 'Otros',           alimento: 'Verdura',       frecuencia: '14/7'   },
  { nutriente: 'Otros',           alimento: 'Huevo',         frecuencia: '4-5/7'  },
  { nutriente: 'Otros',           alimento: 'Mariscos',      frecuencia: '0,25/7' },
];

const NORMAS_DIARIAS = {
  agua_litros_min: 2.5,
  frutas_piezas:   2,
  kcal_por_pieza_fruta: 70,
  // Macros estimados por pieza de fruta media (manzana/naranja/pera/plátano):
  p_por_pieza_fruta: 1,
  c_por_pieza_fruta: 17,
  f_por_pieza_fruta: 0,
  notas_fruta: 'Piezas como naranja, nectarina, pera, pomelo, piña, plátano y/o sandía (rodaja mediana). El peso es orientativo: si el fruto entero pesa 20-30g de más, no pasa nada.',
};

// Sinónimos / palabras clave para búsqueda natural
const SINONIMOS = {
  'pescado':       ['p-dorada','p-lubina','p-sardina','p-salmon','p-merluza','p-atun-pavo'],
  'pescado azul':  ['p-sardina','p-salmon'],
  'pescado blanco':['p-dorada','p-lubina','p-merluza'],
  'marisco':       ['p-pulpo','p-langostinos','p-calamar'],
  'carne':         ['p-jamon-serrano','p-carne-picada','p-pollo','p-pavo-fiambre','p-lomo-embuchado','p-lomo-cerdo','p-jamon-cocido'],
  'carne roja':    ['p-carne-picada'],
  'ave':           ['p-pollo','p-pavo-fiambre'],
  'pollo':         ['p-pollo'],
  'pavo':          ['p-pavo-fiambre','p-atun-pavo'],
  'cerdo':         ['p-lomo-embuchado','p-lomo-cerdo'],
  'huevo':         ['p-claras-huevo','p-huevos-enteros'],
  'huevos':        ['p-claras-huevo','p-huevos-enteros'],
  'whey':          ['p-whey'],
  'proteína':      'grupo:proteina',
  'proteinas':     'grupo:proteina',
  'hidrato':       'grupo:hidrato',
  'hidratos':      'grupo:hidrato',
  'carbohidratos': 'grupo:hidrato',
  'grasa':         'grupo:grasa',
  'grasas':        'grupo:grasa',
  'fruta':         'grupo:fruta',
  'frutas':        'grupo:fruta',
  'verdura':       'grupo:vegetal',
  'verduras':      'grupo:vegetal',
  'vegetal':       'grupo:vegetal',
  'vegetales':     'grupo:vegetal',
  'frutos secos':  ['g-almendras-nueces','g-cacahuete-mix','g-peanut-butter'],
  'fiambre':       ['p-pavo-fiambre','p-jamon-cocido','p-atun-pavo'],
  'lácteo':        ['p-queso-fresco','g-queso-cabra','g-grana-padano','g-mantequilla'],
  'lacteo':        ['p-queso-fresco','g-queso-cabra','g-grana-padano','g-mantequilla'],
  'queso':         ['p-queso-fresco','g-queso-cabra','g-grana-padano'],
  'rápido':        ['p-jamon-serrano','p-pavo-fiambre','p-jamon-cocido','p-lomo-embuchado','p-queso-fresco','p-whey','p-atun-pavo'],
  'rapido':        ['p-jamon-serrano','p-pavo-fiambre','p-jamon-cocido','p-lomo-embuchado','p-queso-fresco','p-whey','p-atun-pavo'],
  'sin cocinar':   ['p-jamon-serrano','p-pavo-fiambre','p-jamon-cocido','p-lomo-embuchado','p-queso-fresco','p-whey','p-atun-pavo'],
};

window.NUTRICION_DATA = {
  COMIDAS,
  HIDRATOS, PROTEINAS, GRASAS, VEGETALES, FRUTAS,
  ALIMENTOS, GRUPOS,
  EQUIVALENCIAS_COCIDO, LEGUMBRES,
  RECOMENDACIONES, CONSEJOS, FAQS,
  FRECUENCIAS_SEMANALES, NORMAS_DIARIAS,
  SINONIMOS,
};
