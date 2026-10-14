/** Recettes fournies avec l'app. Identifiants fixes (voir seedRecipes). */
export interface SeedRecipe {
  id: string;
  name: string;
  emoji: string;
  servings: number;
  time: number;
  tags: string[];
  ingredients: string[];
  steps: string[];
}

export const SEED_RECIPES: SeedRecipe[] = [
  {
    id: 'base-crepes',
    name: 'Crêpes',
    emoji: '🥞',
    servings: 4,
    time: 30,
    tags: ['dessert', 'rapide'],
    ingredients: ['250 g farine', '4 oeufs', '500 ml lait', '50 g beurre', '1 pincée de sel', '2 c. à soupe de sucre (facultatif)'],
    steps: [
      'Mélanger la farine, le sel et le sucre. Creuser un puits, ajouter les oeufs.',
      'Verser le lait petit à petit en fouettant pour éviter les grumeaux.',
      'Ajouter le beurre fondu. Laisser reposer 30 min si possible.',
      'Cuire dans une poêle chaude légèrement beurrée, 1 min de chaque côté.'
    ]
  },
  {
    id: 'base-omelette',
    name: 'Omelette au fromage',
    emoji: '🍳',
    servings: 2,
    time: 10,
    tags: ['rapide', 'végétarien'],
    ingredients: ['4 oeufs', '50 g fromage râpé', '10 g beurre', 'sel', 'poivre'],
    steps: [
      'Battre les oeufs avec sel et poivre.',
      'Faire fondre le beurre dans une poêle, verser les oeufs.',
      'Quand le dessous prend, parsemer de fromage, plier et servir.'
    ]
  },
  {
    id: 'base-pates-carbonara',
    name: 'Pâtes carbonara',
    emoji: '🍝',
    servings: 4,
    time: 20,
    tags: ['rapide'],
    ingredients: ['400 g pâtes', '200 g lardons', '3 oeufs', '60 g parmesan', 'poivre'],
    steps: [
      'Cuire les pâtes dans une grande casserole d’eau salée.',
      'Faire dorer les lardons à sec dans une poêle.',
      'Battre les oeufs avec le parmesan et beaucoup de poivre.',
      'Égoutter les pâtes en gardant un peu d’eau de cuisson, mélanger hors du feu avec les lardons puis les oeufs. Détendre avec l’eau de cuisson.'
    ]
  },
  {
    id: 'base-pates-bolognaise',
    name: 'Pâtes bolognaise',
    emoji: '🍝',
    servings: 4,
    time: 45,
    tags: ['plat'],
    ingredients: ['400 g pâtes', '400 g boeuf haché', '1 oignon', '1 gousse d’ail', '500 g coulis de tomate', '1 carotte (facultatif)', '2 c. à soupe d’huile', 'sel', 'poivre'],
    steps: [
      'Faire revenir l’oignon, l’ail et la carotte hachés dans l’huile.',
      'Ajouter la viande, faire dorer.',
      'Verser le coulis, saler, poivrer, mijoter 30 min à feu doux.',
      'Servir sur les pâtes cuites.'
    ]
  },
  {
    id: 'base-quiche-lorraine',
    name: 'Quiche lorraine',
    emoji: '🥧',
    servings: 6,
    time: 50,
    tags: ['plat'],
    ingredients: ['1 pâte brisée', '200 g lardons', '3 oeufs', '200 ml crème fraîche', '200 ml lait', '1 pincée de muscade (facultatif)', 'sel', 'poivre'],
    steps: [
      'Préchauffer le four à 200 °C. Foncer un moule avec la pâte.',
      'Faire revenir les lardons, les répartir sur la pâte.',
      'Battre oeufs, crème, lait, sel, poivre et muscade ; verser sur les lardons.',
      'Cuire 30 à 35 min.'
    ]
  },
  {
    id: 'base-gratin-dauphinois',
    name: 'Gratin dauphinois',
    emoji: '🥔',
    servings: 6,
    time: 90,
    tags: ['accompagnement', 'végétarien'],
    ingredients: ['1 kg pommes de terre', '500 ml lait', '250 ml crème fraîche', '1 gousse d’ail', '20 g beurre', '1 pincée de muscade (facultatif)', 'sel', 'poivre'],
    steps: [
      'Préchauffer le four à 160 °C. Frotter un plat avec l’ail puis le beurrer.',
      'Éplucher et couper les pommes de terre en fines rondelles.',
      'Les faire frémir 10 min dans le lait avec sel, poivre, muscade.',
      'Verser dans le plat, couvrir de crème, cuire 1 h.'
    ]
  },
  {
    id: 'base-soupe-legumes',
    name: 'Soupe de légumes',
    emoji: '🥣',
    servings: 4,
    time: 40,
    tags: ['soupe', 'végétarien'],
    ingredients: ['3 carottes', '2 pommes de terre', '1 poireau', '1 oignon', '1 cube de bouillon', '1 l eau', 'sel', 'poivre'],
    steps: [
      'Éplucher et couper les légumes en morceaux.',
      'Les mettre dans l’eau avec le bouillon, porter à ébullition.',
      'Cuire 25 min, mixer, assaisonner.'
    ]
  },
  {
    id: 'base-poulet-roti',
    name: 'Poulet rôti et pommes de terre',
    emoji: '🍗',
    servings: 4,
    time: 90,
    tags: ['plat'],
    ingredients: ['1 poulet', '800 g pommes de terre', '30 g beurre', '2 gousses d’ail', '1 brin de thym (facultatif)', 'sel', 'poivre'],
    steps: [
      'Préchauffer le four à 210 °C.',
      'Badigeonner le poulet de beurre, saler, poivrer, mettre l’ail et le thym à l’intérieur.',
      'Disposer les pommes de terre coupées autour.',
      'Cuire 1 h 15 en arrosant régulièrement.'
    ]
  },
  {
    id: 'base-croque-monsieur',
    name: 'Croque-monsieur',
    emoji: '🥪',
    servings: 2,
    time: 15,
    tags: ['rapide'],
    ingredients: ['4 tranches de pain de mie', '2 tranches de jambon', '80 g fromage râpé', '20 g beurre'],
    steps: [
      'Beurrer les tranches de pain.',
      'Garnir de jambon et fromage, refermer, parsemer de fromage.',
      'Cuire 10 min au four à 200 °C ou à la poêle.'
    ]
  },
  {
    id: 'base-riz-cantonais',
    name: 'Riz cantonais',
    emoji: '🍚',
    servings: 4,
    time: 25,
    tags: ['rapide'],
    ingredients: ['300 g riz', '3 oeufs', '150 g jambon', '150 g petits pois', '1 oignon', '2 c. à soupe de sauce soja', '2 c. à soupe d’huile'],
    steps: [
      'Cuire le riz, le laisser refroidir.',
      'Faire une omelette fine, la couper en lamelles.',
      'Faire revenir l’oignon, ajouter petits pois, jambon en dés, riz.',
      'Ajouter l’omelette et la sauce soja, mélanger.'
    ]
  },
  {
    id: 'base-chili',
    name: 'Chili con carne',
    emoji: '🌶️',
    servings: 4,
    time: 60,
    tags: ['plat'],
    ingredients: ['500 g boeuf haché', '400 g haricots rouges', '400 g tomates concassées', '1 oignon', '2 gousses d’ail', '1 c. à café de cumin', '1 c. à café de piment (facultatif)', '200 g riz'],
    steps: [
      'Faire revenir l’oignon et l’ail, ajouter la viande.',
      'Ajouter tomates, épices, haricots égouttés.',
      'Mijoter 40 min. Servir avec le riz.'
    ]
  },
  {
    id: 'base-hachis-parmentier',
    name: 'Hachis parmentier',
    emoji: '🥘',
    servings: 4,
    time: 60,
    tags: ['plat'],
    ingredients: ['1 kg pommes de terre', '500 g boeuf haché', '1 oignon', '200 ml lait', '50 g beurre', '50 g fromage râpé (facultatif)', 'sel', 'poivre'],
    steps: [
      'Cuire les pommes de terre, les écraser en purée avec lait et beurre.',
      'Faire revenir l’oignon et la viande, assaisonner.',
      'Dans un plat : viande puis purée, fromage par-dessus.',
      'Gratiner 20 min à 200 °C.'
    ]
  },
  {
    id: 'base-ratatouille',
    name: 'Ratatouille',
    emoji: '🍆',
    servings: 4,
    time: 60,
    tags: ['plat', 'végétarien'],
    ingredients: ['1 aubergine', '2 courgettes', '2 poivrons', '4 tomates', '1 oignon', '2 gousses d’ail', '4 c. à soupe d’huile', 'sel', 'poivre'],
    steps: [
      'Couper tous les légumes en dés.',
      'Faire revenir oignon et ail dans l’huile, ajouter poivrons, aubergine, courgettes.',
      'Ajouter les tomates, saler, poivrer, mijoter 40 min.'
    ]
  },
  {
    id: 'base-salade-nicoise',
    name: 'Salade niçoise',
    emoji: '🥗',
    servings: 4,
    time: 20,
    tags: ['salade', 'rapide'],
    ingredients: ['1 salade', '4 tomates', '4 oeufs', '200 g thon', '100 g olives (facultatif)', '200 g haricots verts', '3 c. à soupe d’huile', '1 c. à soupe de vinaigre'],
    steps: [
      'Cuire les oeufs 10 min, les haricots verts 8 min.',
      'Disposer salade, tomates, haricots, thon, oeufs, olives.',
      'Arroser de vinaigrette.'
    ]
  },
  {
    id: 'base-gateau-chocolat',
    name: 'Gâteau au chocolat',
    emoji: '🍫',
    servings: 6,
    time: 40,
    tags: ['dessert'],
    ingredients: ['200 g chocolat noir', '150 g beurre', '150 g sucre', '4 oeufs', '50 g farine'],
    steps: [
      'Préchauffer le four à 180 °C.',
      'Faire fondre chocolat et beurre.',
      'Fouetter oeufs et sucre, ajouter le chocolat puis la farine.',
      'Verser dans un moule beurré, cuire 20 à 25 min.'
    ]
  },
  {
    id: 'base-gateau-yaourt',
    name: 'Gâteau au yaourt',
    emoji: '🍰',
    servings: 6,
    time: 45,
    tags: ['dessert'],
    ingredients: ['1 yaourt', '3 oeufs', '250 g farine', '200 g sucre', '100 ml huile', '1 sachet de levure'],
    steps: [
      'Préchauffer le four à 180 °C.',
      'Mélanger yaourt, oeufs, sucre, puis farine et levure, puis huile.',
      'Cuire 35 min dans un moule beurré.'
    ]
  },
  {
    id: 'base-pain-perdu',
    name: 'Pain perdu',
    emoji: '🍞',
    servings: 4,
    time: 15,
    tags: ['dessert', 'rapide', 'anti-gaspi'],
    ingredients: ['8 tranches de pain', '2 oeufs', '250 ml lait', '50 g sucre', '30 g beurre'],
    steps: [
      'Battre oeufs, lait et sucre.',
      'Tremper les tranches de pain.',
      'Dorer à la poêle dans le beurre.'
    ]
  },
  {
    id: 'base-crumble-pommes',
    name: 'Crumble aux pommes',
    emoji: '🍎',
    servings: 6,
    time: 45,
    tags: ['dessert'],
    ingredients: ['6 pommes', '150 g farine', '100 g sucre', '100 g beurre'],
    steps: [
      'Préchauffer le four à 180 °C. Couper les pommes en dés dans un plat.',
      'Sabler du bout des doigts farine, sucre et beurre froid.',
      'Recouvrir les pommes, cuire 30 min.'
    ]
  },
  {
    id: 'base-mousse-chocolat',
    name: 'Mousse au chocolat',
    emoji: '🍮',
    servings: 4,
    time: 20,
    tags: ['dessert'],
    ingredients: ['200 g chocolat noir', '6 oeufs', '1 pincée de sel'],
    steps: [
      'Faire fondre le chocolat. Séparer blancs et jaunes.',
      'Mélanger les jaunes au chocolat tiédi.',
      'Monter les blancs en neige ferme avec le sel, incorporer délicatement.',
      'Réfrigérer au moins 3 h.'
    ]
  },
  {
    id: 'base-tartiflette',
    name: 'Tartiflette',
    emoji: '🧀',
    servings: 4,
    time: 60,
    tags: ['plat'],
    ingredients: ['1 kg pommes de terre', '1 reblochon', '200 g lardons', '1 oignon', '100 ml crème fraîche (facultatif)'],
    steps: [
      'Cuire les pommes de terre à l’eau, les couper en rondelles.',
      'Faire revenir oignon et lardons.',
      'Mélanger dans un plat, ajouter la crème, poser le reblochon coupé en deux.',
      'Cuire 25 min à 200 °C.'
    ]
  },
  {
    id: 'base-saumon-papillote',
    name: 'Saumon en papillote',
    emoji: '🐟',
    servings: 2,
    time: 25,
    tags: ['plat', 'rapide'],
    ingredients: ['2 pavés de saumon', '1 citron', '1 courgette', '2 c. à soupe d’huile', 'sel', 'poivre'],
    steps: [
      'Préchauffer le four à 200 °C.',
      'Sur du papier cuisson : courgette en rondelles, saumon, rondelles de citron, huile, sel, poivre.',
      'Fermer et cuire 15 à 20 min.'
    ]
  },
  {
    id: 'base-curry-poulet',
    name: 'Curry de poulet au lait de coco',
    emoji: '🍛',
    servings: 4,
    time: 35,
    tags: ['plat'],
    ingredients: ['600 g poulet', '400 ml lait de coco', '1 oignon', '2 c. à soupe de curry', '300 g riz', '2 c. à soupe d’huile'],
    steps: [
      'Faire revenir l’oignon dans l’huile, ajouter le poulet en morceaux.',
      'Ajouter le curry puis le lait de coco, mijoter 20 min.',
      'Servir avec le riz.'
    ]
  },
  {
    id: 'base-lentilles-saucisses',
    name: 'Lentilles aux saucisses',
    emoji: '🌭',
    servings: 4,
    time: 50,
    tags: ['plat'],
    ingredients: ['300 g lentilles', '4 saucisses', '1 oignon', '2 carottes', '1 cube de bouillon'],
    steps: [
      'Faire revenir oignon et carottes, ajouter les saucisses.',
      'Ajouter lentilles, bouillon et eau à hauteur.',
      'Cuire 35 min à feu doux.'
    ]
  },
  {
    id: 'base-pizza',
    name: 'Pizza maison',
    emoji: '🍕',
    servings: 2,
    time: 30,
    tags: ['plat'],
    ingredients: ['1 pâte à pizza', '200 g sauce tomate', '1 mozzarella', '100 g jambon (facultatif)', '100 g champignons (facultatif)'],
    steps: [
      'Préchauffer le four à 240 °C.',
      'Étaler la pâte, couvrir de sauce tomate.',
      'Garnir de mozzarella, jambon, champignons.',
      'Cuire 12 à 15 min.'
    ]
  },
  {
    id: 'base-veloute-potiron',
    name: 'Velouté de potiron',
    emoji: '🎃',
    servings: 4,
    time: 40,
    tags: ['soupe', 'végétarien'],
    ingredients: ['1 kg potiron', '2 pommes de terre', '1 oignon', '1 cube de bouillon', '100 ml crème liquide (facultatif)', 'sel', 'poivre'],
    steps: [
      'Éplucher et couper potiron, pommes de terre et oignon.',
      'Couvrir d’eau avec le bouillon, cuire 25 min.',
      'Mixer, ajouter la crème, assaisonner.'
    ]
  },
  {
    id: 'base-pates-thon-tomate',
    name: 'Pâtes au thon et à la tomate',
    emoji: '🍝',
    servings: 4,
    time: 20,
    tags: ['rapide', 'placard'],
    ingredients: ['400 g pâtes', '200 g thon', '400 g coulis de tomate', '1 oignon', '2 c. à soupe d’huile'],
    steps: [
      'Cuire les pâtes.',
      'Faire revenir l’oignon, ajouter coulis et thon émietté, chauffer 10 min.',
      'Mélanger aux pâtes.'
    ]
  },
  {
    id: 'base-oeufs-cocotte',
    name: 'Oeufs cocotte',
    emoji: '🥚',
    servings: 2,
    time: 15,
    tags: ['rapide', 'végétarien'],
    ingredients: ['4 oeufs', '100 ml crème fraîche', '30 g fromage râpé (facultatif)', 'sel', 'poivre'],
    steps: [
      'Préchauffer le four à 180 °C.',
      'Dans des ramequins : crème, un oeuf, sel, poivre, fromage.',
      'Cuire au bain-marie 10 min.'
    ]
  },
  {
    id: 'base-salade-pates',
    name: 'Salade de pâtes',
    emoji: '🥗',
    servings: 4,
    time: 20,
    tags: ['salade', 'rapide'],
    ingredients: ['300 g pâtes', '3 tomates', '150 g jambon', '100 g emmental', '3 c. à soupe d’huile', '1 c. à soupe de vinaigre', '1 c. à café de moutarde'],
    steps: [
      'Cuire les pâtes, les refroidir.',
      'Couper tomates, jambon et emmental en dés.',
      'Mélanger avec une vinaigrette moutarde.'
    ]
  },
  {
    id: 'base-boeuf-carottes',
    name: 'Boeuf carottes',
    emoji: '🥕',
    servings: 4,
    time: 150,
    tags: ['plat'],
    ingredients: ['800 g boeuf à braiser', '1 kg carottes', '2 oignons', '1 cube de bouillon', '250 ml vin blanc (facultatif)', '2 c. à soupe d’huile'],
    steps: [
      'Faire dorer la viande en morceaux dans l’huile, ajouter les oignons.',
      'Ajouter carottes en rondelles, vin, bouillon et eau à hauteur.',
      'Mijoter 2 h à couvert à feu doux.'
    ]
  },
  {
    id: 'base-riz-au-lait',
    name: 'Riz au lait',
    emoji: '🍚',
    servings: 4,
    time: 45,
    tags: ['dessert'],
    ingredients: ['120 g riz', '1 l lait', '80 g sucre', '1 sachet de sucre vanillé (facultatif)'],
    steps: [
      'Porter le lait à frémissement avec le sucre vanillé.',
      'Ajouter le riz, cuire 35 min à feu doux en remuant.',
      'Ajouter le sucre en fin de cuisson. Servir tiède ou froid.'
    ]
  }
];
