/**
 * Things that should exist on the NUST map. `npm run audit` checks each against nust-full.geojson + landmarks.ts
 * and writes docs/feature-check.md (FOUND / MISSING / AMBIGUOUS).
 * `match` are case-insensitive regexes tested against name, name:en, alt_name, short_name and landmark aliases.
 */
export interface Expected {
  label: string;
  group: string;
  match: string[];
}

const e = (group: string, label: string, ...match: string[]): Expected => ({
  group,
  label,
  match: match.length ? match : [`^${label}$`],
});

export const EXPECTED: Expected[] = [
  // Schools & academic
  e('Academic', 'NICE', '^nice$'),
  e('Academic', 'NIT', '^nit$'),
  e('Academic', 'SCEE', 'scee', 'civil and environmental'),
  e('Academic', 'USPCAS-E', 'uspcas'),
  e('Academic', 'Exam center', 'exam cent'),
  e('Academic', 'ASAB', '^asab$'),
  e('Academic', 'SADA', '^sada$'),
  e('Academic', 'CIPS 2', 'cips ?2'),
  e('Academic', 'IGIS', '^igis$'),
  e('Academic', 'RIMMS', '^rimms$'),
  e('Academic', 'IAEC', '^iaec$'),
  e('Academic', 'NUST Business School', 'business school', '^nbs$'),
  e('Academic', 'Nust Law School', 'law school'),
  e('Academic', 'S3H', '^s3h$'),
  e('Academic', 'SEECS Faculty Block', 'seecs faculty'),
  e('Academic', 'SEECS PG Block', 'seecs pg'),
  e('Academic', 'SEECS UG Block', 'seecs ug'),
  e('Academic', 'SCME', 'scme$', 'chemical and materials'),
  e('Academic', 'SNS New Building', 'sns new'),
  e('Academic', 'School of Health Sciences', 'health sciences'),
  e('Academic', 'IESE', '^iese'),
  e('Academic', 'NSTP', 'nstp', 'science and technology park'),
  e('Academic', 'SINES', 'sines'),
  e('Academic', 'CEMTECH', 'cemtech'),
  e('Academic', 'Creative Learning School', 'creative learning'),
  e('Academic', 'SMME', 'smme', 'mechanical and manufacturing'),
  // Admin & services
  e('Admin', 'Main Office', 'main office'),
  e('Admin', 'Auditorium', 'auditorium'),
  e('Admin', 'Central Library', 'central library'),
  e('Admin', 'Admin Office', '^admin office'),
  e('Admin', 'Rector house', 'rector'),
  e('Admin', 'Central Ac Chiller', 'chiller'),
  e('Admin', 'Grid Station', 'grid station'),
  e('Admin', 'Medical Center', 'medical cent', 'dispensary', 'medical school'),
  // Gates
  e('Gates', 'Gate 4', 'gate\\D*0?4\\b'),
  e('Gates', 'Gate 15', 'gate\\D*15\\b'),
  e('Gates', 'Gate 16', 'gate\\D*16\\b'),
  // Hostels
  e('Hostels', 'Ghazali 1', 'ghazali ?-?(1|i)\\b'),
  e('Hostels', 'Ghazali 2', 'ghazali ?-?(2|ii)\\b'),
  e('Hostels', 'Rehmat', 'rehmat hostel|rahmat hostel|^rehmat$|^rahmat$'),
  e('Hostels', 'Razi 1', 'razi ?-?(1|i)\\b|razi hostel'),
  e('Hostels', 'Zakariya', 'zakar'),
  e('Hostels', 'Hajveri', 'hajveri'),
  e('Hostels', 'Attar 1', 'attar ?-?(1|i)\\b|attar hostel'),
  e('Hostels', 'Attar 2', 'attar ?-?(2|ii)\\b'),
  e('Hostels', 'Liaquat', 'liaquat'),
  e('Hostels', 'Rumi', '^rumi'),
  e('Hostels', 'Fatima I', 'fatima ?-?(1|i)$'),
  e('Hostels', 'Fatima II', 'fatima ?-?(2|ii)$'),
  e('Hostels', 'Fatima III', 'fatima ?-?(3|iii)$'),
  e('Hostels', 'Ayesha', 'ayesha'),
  e('Hostels', 'Khadija', 'khadija'),
  e('Hostels', 'Amna', 'amna'),
  // Food
  e('Food', 'Iqbal Mess', 'iqbal mess'),
  e('Food', 'Sir Syed Mess', 'sir syed'),
  e('Food', 'Bhittai Mess', 'bhittai'),
  e('Food', 'Concordia', 'concordia'),
  e('Food', 'Coffee Lounge', 'coffee lounge'),
  e('Food', 'Shawarma Ladz', 'shawarma'),
  e('Food', 'RETRO', '^retro$'),
  e('Food', 'SCME Canteen', 'scme canteen'),
  // Sports
  e('Sports', 'Football grounds', 'football'),
  e('Sports', 'Tennis', 'tennis'),
  e('Sports', 'HBL cricket', 'hbl cricket'),
  e('Sports', 'SCME cricket', 'scme cricket'),
  e('Sports', 'NBS Ground', 'nbs ground'),
  e('Sports', 'NICE Ground', 'nice ground'),
  e('Sports', 'Sports Complex', 'sports complex'),
  e('Sports', 'Skating Rink', 'skating'),
  e('Sports', 'Swimming Pool', '^swimming pool$'),
  e('Sports', 'Squash court', 'squash'),
  e('Sports', 'Old Gym', 'old gym'),
  e('Sports', 'Gym and Badminton Court', 'badminton'),
  e('Sports', 'Razi basketball', 'basket ?ball'),
  e('Sports', 'Convocation Ground', 'convocation'),
  // Prayer
  e('Prayer', 'Masjid', '^masjid$'),
  e('Prayer', 'Masjid-e-Rehmat', 'masjid-e-rehmat|masjid e rehmat'),
];
