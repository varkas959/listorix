/** 60 common Indian grocery items for smart suggestions. */
export interface SuggestionSeed {
  name:     string;
  category: string;
}

export const INDIAN_GROCERY_SUGGESTIONS: SuggestionSeed[] = [
  // Vegetables
  { name: 'Tomatoes',       category: 'Vegetables' },
  { name: 'Onion',          category: 'Vegetables' },
  { name: 'Potato',         category: 'Vegetables' },
  { name: 'Spinach',        category: 'Vegetables' },
  { name: 'Capsicum',       category: 'Vegetables' },
  { name: 'Cauliflower',    category: 'Vegetables' },
  { name: 'Brinjal',        category: 'Vegetables' },
  { name: 'Bitter Gourd',   category: 'Vegetables' },
  { name: 'Drumstick',      category: 'Vegetables' },
  { name: 'Lady Finger',    category: 'Vegetables' },
  { name: 'Cabbage',        category: 'Vegetables' },
  { name: 'Carrot',         category: 'Vegetables' },
  { name: 'Beans',          category: 'Vegetables' },
  { name: 'Cucumber',       category: 'Vegetables' },
  { name: 'Peas',           category: 'Vegetables' },
  // Fruits
  { name: 'Banana',         category: 'Fruits' },
  { name: 'Apple',          category: 'Fruits' },
  { name: 'Mango',          category: 'Fruits' },
  { name: 'Grapes',         category: 'Fruits' },
  { name: 'Papaya',         category: 'Fruits' },
  { name: 'Pomegranate',    category: 'Fruits' },
  { name: 'Watermelon',     category: 'Fruits' },
  // Dairy
  { name: 'Milk',           category: 'Dairy' },
  { name: 'Curd',           category: 'Dairy' },
  { name: 'Paneer',         category: 'Dairy' },
  { name: 'Butter',         category: 'Dairy' },
  { name: 'Ghee',           category: 'Dairy' },
  { name: 'Cheese',         category: 'Dairy' },
  // Grains
  { name: 'Basmati Rice',   category: 'Grains' },
  { name: 'Wheat Atta',     category: 'Grains' },
  { name: 'Poha',           category: 'Grains' },
  { name: 'Rava',           category: 'Grains' },
  { name: 'Oats',           category: 'Grains' },
  { name: 'Maida',          category: 'Grains' },
  // Pulses
  { name: 'Toor Dal',       category: 'Pulses' },
  { name: 'Chana Dal',      category: 'Pulses' },
  { name: 'Moong Dal',      category: 'Pulses' },
  { name: 'Masoor Dal',     category: 'Pulses' },
  { name: 'Rajma',          category: 'Pulses' },
  { name: 'Chole',          category: 'Pulses' },
  // Spices
  { name: 'Turmeric',       category: 'Spices' },
  { name: 'Red Chilli Powder', category: 'Spices' },
  { name: 'Coriander Powder',  category: 'Spices' },
  { name: 'Cumin Seeds',    category: 'Spices' },
  { name: 'Garam Masala',   category: 'Spices' },
  { name: 'Mustard Seeds',  category: 'Spices' },
  // Oils & Sauces
  { name: 'Sunflower Oil',  category: 'Oils & Sauces' },
  { name: 'Coconut Oil',    category: 'Oils & Sauces' },
  { name: 'Mustard Oil',    category: 'Oils & Sauces' },
  { name: 'Tomato Ketchup', category: 'Oils & Sauces' },
  // Snacks & Bakery
  { name: 'Biscuits',       category: 'Snacks' },
  { name: 'Chips',          category: 'Snacks' },
  { name: 'Bread',          category: 'Bakery' },
  { name: 'Rusk',           category: 'Bakery' },
  // Beverages
  { name: 'Tea',            category: 'Beverages' },
  { name: 'Coffee',         category: 'Beverages' },
  { name: 'Sugar',          category: 'Beverages' },
  // Cleaning
  { name: 'Dish Soap',      category: 'Cleaning' },
  { name: 'Laundry Detergent', category: 'Cleaning' },
  { name: 'Floor Cleaner',  category: 'Cleaning' },
];
