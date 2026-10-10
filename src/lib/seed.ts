import type { CardDraft } from "./ai";

// The demo deck every new visitor starts with, so the quiz works with zero setup and zero AI calls.
export const SEED_DECK_TITLE = "Supply and demand basics";

export const SEED_CARDS: CardDraft[] = [
  {
    topic: "Demand",
    front: "What does the law of demand say about price and quantity demanded?",
    back: "When the price of a good rises, people buy less of it, and when the price falls, they buy more, all else equal.",
    source_excerpt: "As price rises, quantity demanded falls, holding other factors constant.",
  },
  {
    topic: "Supply",
    front: "What does the law of supply say about price and quantity supplied?",
    back: "When the price of a good rises, producers are willing to sell more of it, and when it falls they sell less.",
    source_excerpt: "Higher prices give producers a reason to supply more.",
  },
  {
    topic: "Market equilibrium",
    front: "What is the equilibrium price in a market?",
    back: "It is the price where the quantity buyers want to purchase equals the quantity sellers want to sell.",
    source_excerpt: "At equilibrium, quantity demanded equals quantity supplied.",
  },
  {
    topic: "Market equilibrium",
    front: "What happens in a market when the price is set above equilibrium?",
    back: "There is a surplus: sellers offer more than buyers want, which pushes the price down.",
    source_excerpt: "A price above equilibrium creates a surplus.",
  },
  {
    topic: "Market equilibrium",
    front: "What happens in a market when the price is set below equilibrium?",
    back: "There is a shortage: buyers want more than sellers offer, which pushes the price up.",
    source_excerpt: "A price below equilibrium creates a shortage.",
  },
  {
    topic: "Demand",
    front: "How is a change in quantity demanded different from a change in demand?",
    back: "A change in quantity demanded is a move along the demand curve caused by price; a change in demand is a shift of the whole curve caused by something else, like income or tastes.",
    source_excerpt: "Only a change in price moves us along the curve; other factors shift it.",
  },
  {
    topic: "Demand shifters",
    front: "Name two things other than price that can shift the demand curve.",
    back: "Examples are income, tastes, prices of related goods, expectations about the future, and the number of buyers.",
    source_excerpt: "Demand shifters include income, tastes, related prices, expectations and the number of buyers.",
  },
  {
    topic: "Demand shifters",
    front: "What are substitute goods, and how does a price rise in one affect demand for the other?",
    back: "Substitutes can replace each other, like coffee and tea; when one gets more expensive, demand for the other rises.",
    source_excerpt: "When the price of a substitute rises, demand for the good increases.",
  },
  {
    topic: "Demand shifters",
    front: "What are complementary goods? Give an example.",
    back: "Complements are used together, like printers and ink; when one gets more expensive, demand for the other falls.",
    source_excerpt: "Complements are consumed together, so a price rise in one lowers demand for the other.",
  },
  {
    topic: "Supply shifters",
    front: "How does a drop in the cost of production affect the supply curve?",
    back: "Supply increases and the curve shifts to the right, because producers can offer more at every price.",
    source_excerpt: "Lower input costs shift supply to the right.",
  },
  {
    topic: "Elasticity",
    front: "What does it mean for demand to be price elastic?",
    back: "Quantity demanded responds strongly to price changes, so a small price change causes a large change in how much people buy.",
    source_excerpt: "Elastic demand means buyers are very responsive to price.",
  },
  {
    topic: "Elasticity",
    front: "Why is demand for a necessity like insulin usually inelastic?",
    back: "People need it and have few substitutes, so they keep buying about the same amount even when the price rises.",
    source_excerpt: "Goods with few substitutes and high necessity tend to have inelastic demand.",
  },
];
