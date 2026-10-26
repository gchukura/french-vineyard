import type { CardProps } from "@/components/Card";
import type { Fact } from "@/components/FactStrip";
import type { HotelCardHotel } from "@/components/HotelCard";
import type { MapPin } from "@/components/map/Map";
import type { TourCardTour } from "@/components/TourCard";
import type { FaqItem } from "@/lib/schema";

/**
 * Fixture data for /styleguide only. These are not real tours or hotels and
 * must never be shown on content pages, which take tours from the Tours tab.
 * Images are abstract illustrations, not depictions of any place.
 */

const img = (name: string) => `/styleguide/${name}.jpg`;

export const sampleHero = {
  image: {
    src: img("hero"),
    alt: "Abstract illustration of rolling vineyard hills",
    credit: "Sample illustration",
  },
  eyebrow: "Wine region guide",
  title: "Champagne",
  standfirst: "Chalk cellars, hillside villages and grower houses an hour east of Paris.",
};

export const sampleFacts: [Fact, Fact, Fact, Fact] = [
  { label: "From Paris", value: "45 min TGV" },
  { label: "Best months", value: "May–Sept" },
  { label: "Signature grape", value: "Pinot Noir" },
  { label: "UNESCO", value: "Since 2015" },
];

export const sampleCards: CardProps[] = [
  {
    href: "/towns/epernay/",
    title: "Épernay",
    eyebrow: "Town guide",
    description: "The Avenue de Champagne and the houses along it.",
    image: { src: img("card-1"), alt: "" },
  },
  {
    href: "/towns/reims/",
    title: "Reims",
    eyebrow: "Town guide",
    description: "Cathedral city with cellars carved into chalk.",
    image: { src: img("card-2"), alt: "" },
  },
  {
    href: "/towns/hautvillers/",
    title: "Hautvillers",
    eyebrow: "Village",
    description: "A hilltop village above the Marne valley.",
    image: { src: img("card-3"), alt: "" },
  },
];

export const sampleTours: TourCardTour[] = [
  {
    id: "sample-1",
    provider: "gyg",
    title: "Sample: half-day cellar visit with a grower",
    badge: "Top pick",
    why_picked: "Small groups and a family-run house, so you hear from the people who make it.",
    image: img("tour-1"),
    price_from_eur: 89,
    duration: "4 hours",
    rating: 4.8,
    review_count: 1204,
    bullets_json: ["Visit two estates", "Walk through the vines", "Hotel pickup in town"],
    best_for: "First-time visitors",
  },
  {
    id: "sample-2",
    provider: "viator",
    title: "Sample: full-day villages tour by minibus",
    badge: "Best value",
    why_picked: "Covers three villages without needing a car.",
    image: img("tour-2"),
    price_from_eur: 145,
    duration: "8 hours",
    rating: 4.6,
    review_count: 389,
    bullets_json: ["Three villages", "Lunch included", "English-speaking guide"],
    best_for: "Travellers without a car",
  },
  {
    id: "sample-3",
    provider: "winalist",
    title: "Sample: private estate tasting",
    badge: undefined,
    why_picked: "Book direct with the estate for a seated, unhurried visit.",
    image: img("tour-3"),
    price_from_eur: 35,
    duration: "90 minutes",
    rating: 4.9,
    review_count: 57,
    bullets_json: ["Cellar tour", "Seated tasting", "Walk-up not possible"],
    best_for: "Couples",
  },
];

export const sampleHotels: HotelCardHotel[] = [
  {
    id: "sample-hotel-1",
    name: "Sample guesthouse",
    tier: "budget",
    booking_hotel_id: "x",
    expedia_id: undefined,
    price_from_eur: 85,
    blurb: "Five rooms above a bakery, a short walk from the station.",
    best_for: "Train travellers",
    image: img("hotel-1"),
    image_credit: "Sample illustration",
  },
  {
    id: "sample-hotel-2",
    name: "Sample town hotel",
    tier: "mid",
    booking_hotel_id: "x",
    expedia_id: "x",
    price_from_eur: 160,
    blurb: "Quiet rooms on a garden courtyard.",
    best_for: "Walking to the cellars",
    image: img("hotel-2"),
    image_credit: undefined,
  },
  {
    id: "sample-hotel-3",
    name: "Sample château hotel",
    tier: "luxury",
    booking_hotel_id: "x",
    expedia_id: "x",
    price_from_eur: 420,
    blurb: "A country house among the vines with a spa.",
    best_for: "Special occasions",
    image: img("hotel-3"),
    image_credit: undefined,
  },
];

export const sampleTable = {
  caption: "Getting there from Paris",
  columns: ["Route", "Time", "From"],
  numeric: [1, 2],
  rows: [
    ["TGV to Reims", "0h45", "€19"],
    ["TER to Épernay", "1h15", "€25"],
    ["Car via A4", "1h50", "€14 tolls"],
    ["Coach", "2h10", "€9"],
  ],
};

export const sampleFaq: FaqItem[] = [
  {
    question: "Do I need to book cellar visits in advance?",
    answer:
      "Yes for most houses, especially at weekends. Smaller growers often need a few days' notice.",
  },
  {
    question: "Can I visit without a car?",
    answer: "Yes. Reims and Épernay are on the train line, and many tours include pickup.",
  },
  {
    question: "When is harvest?",
    answer: "Usually late August to late September. Some cellars close to visitors during it.",
  },
];

export const sampleCrumbs = [
  { name: "Home", href: "/" },
  { name: "Wine Regions", href: "/regions/" },
  { name: "Champagne", href: "/regions/champagne/" },
];

export const samplePins: MapPin[] = [
  {
    id: "reims",
    name: "Reims",
    lat: 49.2583,
    lng: 4.0317,
    href: "/towns/reims/",
    description: "Cathedral city",
  },
  { id: "epernay", name: "Épernay", lat: 49.0431, lng: 3.9559, href: "/towns/epernay/" },
  { id: "hautvillers", name: "Hautvillers", lat: 49.0806, lng: 3.9439 },
  { id: "ay", name: "Aÿ", lat: 49.0547, lng: 4.0036 },
];

export const sampleMenuRegions = [
  {
    slug: "champagne",
    name: "Champagne",
    tagline: "Chalk cellars an hour from Paris",
    image: { src: img("card-1"), alt: "" },
  },
  {
    slug: "bordeaux",
    name: "Bordeaux",
    tagline: "Châteaux on both banks",
    image: { src: img("card-2"), alt: "" },
  },
  {
    slug: "burgundy",
    name: "Burgundy",
    tagline: "Village by village along the Côte",
    image: { src: img("card-3"), alt: "" },
  },
];

export const samplePanorama = {
  src: img("panorama"),
  alt: "Abstract illustration of vineyard hills",
  caption: "Sample panorama",
};
