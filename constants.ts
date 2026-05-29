
import { Worker, User } from './types';
import { encrypt } from './utils/crypto';

export const INITIAL_USERS: User[] = [
  {
    username: "AMROUS Abdallah",
    fullName: "AMROUS Abdallah",
    password: encrypt("13062010"),
    role: "ADMIN",
    status: "APPROVED"
  }
];

export const INITIAL_WORKERS: Worker[] = [
  {
    matricule: "10254",
    nom: "BOUZID",
    prenom: "Ahmed",
    dateNaissance: "1985-05-12",
    fonction: "INGENIEUR MECANIQUE NIV 2",
    dateEntree: "2010-02-01",
    dateFin: "",
    wilaya: "Alger",
    affiliation: "16001",
    chantier: "Base Hassi Messaoud",
    affair: "PROJET-A12",
    createdBy: "AMROUS Abdallah",
    createdAt: "2023-01-15",
    lastModifiedBy: "AMROUS Abdallah",
    updatedAt: "2023-06-20"
  },
  {
    matricule: "20541",
    nom: "MANSOURI",
    prenom: "Sarah",
    dateNaissance: "1992-11-23",
    fonction: "CHARGE D'ETUDES NIV 1",
    dateEntree: "2015-06-15",
    dateFin: "",
    wilaya: "Oran",
    affiliation: "31002",
    chantier: "Siège Oran",
    affair: "ADMIN-001",
    createdBy: "System",
    createdAt: "2023-02-10"
  }
];

const RAW_FUNCTIONS = `
ACHETEUR NIV 3 - AGENT ADMINISTRATIF - AGENT D'ENTRETIEN NIV. 1 - AGENT D'ENTRETIEN NIV.1 - AGENT D'ENTRETIEN NIV.2 - AGENT D'ENTRETIEN NIV.3 - AGENT D'HYGIENE - AGENT DE REPROGRAPHIE NIV 2 - AGENT DE SAISIE NIV 2 - AGENT DE SECURITE NIV 2 - AGENT DE SURETE INTERNE NIV.1 - AIDE CUISINIER - AIDE SOIGNANT - AMBULANCIER - ANALYSTE DE STOCKS - ANIMATEUR CULTURE ET LOISIRS NIV 1 - ANIMATEUR SECURITE - ANIMATEUR SPORTIF NIV 2 - ARCHITECTE NIV 1 - ASSISTANT DIRECTEUR NIVEAU 1 - ASSISTANT DIRECTEUR NIVEAU 2 - BOUCHER - BOULANGER - BOULANGER PATISSIER - BUANDIER - C/SECT.GESTION STOCKS PIECES RECHANGE - CADRE ADMINISTRATIF NIV 1 - CADRE ADMINISTRATIF NIV 2 - CADRE FINANCIER & COMPTABLE NIV. 2 - CADRE TECHNIQUE NIV 1 - CADRE TECHNIQUE NIV 2 - CADRE TECHNIQUE NIV 3 - CALORIFUGEUR NIV 1 - CALORIFUGEUR NIV 2 - CALORIFUGEUR NIV 3 - CALORIFUGEUR NIV 4 - CALORIFUGEUR NIV 5 - CARISTE - CHARGE D'ETUDES NIV 1 - CHARGE D'ETUDES NIV 2 - CHARGE D'ETUDES NIV 3 - CHARGE DE MISSION - CHAUDRONNIER NIV 1 - CHAUDRONNIER NIV 2 - CHAUDRONNIER NIV 3 - CHAUDRONNIER NIV 4 - CHAUDRONNIER NIV 5 - CHAUFFEUR GR - CHAUFFEUR PL - CHAUFFEUR POLYVALENT - CHAUFFEUR TC - CHAUFFEUR VL - CHEF SECT BILLETERIE VOYAGE & ACCUEIL - CHEF SECTION HEBERGEMENT/RESTAURATION - CHEF SECTION HOTELLERIE / RESTAURATION - CHEF ATELIER MEC ESSENCE DIESEL - CHEF CUISINIER - CHEF D' ATELIER ELECT. AUTO ENGINS - CHEF D' EQUIPE ELECT. AUTO ENGINS - CHEF D' EQUIPE TRAVAUX D'ENTRETIEN - CHEF D'ATELIER ELECTROMECANIQUE - CHEF D'EQUIPE CHAUDRONNERIE - CHEF D'EQUIPE BARDAGE - CHEF D'EQUIPE COFFRAGE - CHEF D'EQUIPE CONDUCTEUR D'ENGINS - CHEF D'EQUIPE ELECTRICITE INDUST. - CHEF D'EQUIPE ELECTROMECANIQUE - CHEF D'EQUIPE ENROBAGE - CHEF D'EQUIPE ENTRETIEN - CHEF D'EQUIPE ESSAIS - CHEF D'EQUIPE FERRAILLAGE - CHEF D'EQUIPE FRIGORISTE - CHEF D'EQUIPE GENIE CIVIL - CHEF D'EQUIPE INSTRUMENTATION - CHEF D'EQUIPE JARDINIER - CHEF D'EQUIPE MACONNERIE - CHEF D'EQUIPE MENUISERIE EBENISTER - CHEF D'EQUIPE MONTAGE - CHEF D'EQUIPE PEINTURE - CHEF DE CHANTIER - CHEF DE PROJET - CHEF DE SECTION MAINTENANCE - CHEF DE SECTION SECURITE - CONDUCTEUR D'ENGINS NIV 1 - CONDUCTEUR D'ENGINS NIV 2 - CONDUCTEUR D'ENGINS NIV 3 - CONDUCTEUR D'ENGINS NIV 4 - CONDUCTEUR D'ENGINS NIV 5 - CONTROLEUR DE GESTION - COORDINATEUR HSE - CUISINIER NIV 1 - CUISINIER NIV 2 - CUISINIER NIV 3 - DIRECTEUR - ELECTRICIEN AUTO ENGINS NIV 1 - ELECTRICIEN AUTO ENGINS NIV 2 - ELECTRICIEN AUTO ENGINS NIV 3 - ELECTRICIEN AUTO ENGINS NIV 4 - ELECTRICIEN INDUSTRIEL NIV 1 - ELECTRICIEN INDUSTRIEL NIV 2 - ELECTRICIEN INDUSTRIEL NIV 3 - ELECTRICIEN INDUSTRIEL NIV 4 - ELECTRICIEN INDUSTRIEL NIV 5 - INGENIEUR MECANIQUE NIV 1 - INGENIEUR MECANIQUE NIV 2 - INGENIEUR MECANIQUE NIV 3 - INGENIEUR PROCESS NIV 1 - MAGASINIER NIV 1 - MAGASINIER NIV 2 - MECANICIEN ENGINS NIV 1 - MECANICIEN ENGINS NIV 2 - MECANICIEN ENGINS NIV 3 - MECANICIEN ENGINS NIV 4 - MECANICIEN ENGINS NIV 5 - SECRETAIRE - SOUDEUR NIV 1 - SOUDEUR NIV 2 - SOUDEUR NIV 3 - SOUDEUR NIV 4 - SOUDEUR NIV 5 - TECHNICIEN HSE NIV 1 - TECHNICIEN HSE NIV 2 - TECHNICIEN SUPERIEUR - TOPOGRAPHE
`;

export const JOB_FUNCTIONS: string[] = RAW_FUNCTIONS
  .split(' - ')
  .map(f => f.replace(/\r?\n/g, '').trim())
  .filter(f => f.length > 0);

const generateLargeDataset = (count: number): Worker[] => {
  const result: Worker[] = [];
  const surnames = ["BENALI", "BOUAZIZ", "HAMDI", "KAHLOUCHE", "MEZIANE", "SAIDI", "TRARI", "ZIANI", "ABBAS", "BELHADJ", "CHERIF", "DAOUDI", "FELLAH", "GHERBI", "HIDOUSSI", "IDDIR", "JEDDI", "KEBIR", "LAKEHAL", "MOHAMEDI"];
  const firstnames = ["Amine", "Sami", "Karim", "Mounir", "Sofia", "Ines", "Yasmine", "Ryad", "Nabil", "Fatiha", "Lotfi", "Hichem", "Khadidja", "Othmane", "Walid", "Zaki", "Meriem", "Samia", "Lynda", "Farid"];
  const wilayas = ["Alger", "Oran", "Constantine", "Annaba", "Setif", "Bejaia", "Tlemcen", "Biskra", "Ouargla", "Tamanrasset"];
  const chantiers = ["Base Hassi Messaoud", "Base Hassi R'mel", "Chantier A1", "Chantier B2", "Siège Alger", "Base Adrar", "Projet Pipeline"];

  for (let i = 0; i < count; i++) {
    const matricule = (30000 + i).toString();
    result.push({
      matricule,
      nom: surnames[i % surnames.length],
      prenom: firstnames[i % firstnames.length],
      dateNaissance: "1980-01-01",
      fonction: JOB_FUNCTIONS[i % JOB_FUNCTIONS.length],
      dateEntree: "2015-01-01",
      dateFin: "",
      wilaya: wilayas[i % wilayas.length],
      affiliation: (10000 + (i % 50000)).toString(),
      chantier: chantiers[i % chantiers.length],
      affair: `PRJ-${100 + i}`,
      createdBy: "System Import",
      createdAt: new Date().toISOString().split('T')[0]
    });
  }
  return result;
};

export const IMPORTED_WORKERS: Worker[] = [
  ...INITIAL_WORKERS,
  ...generateLargeDataset(6000)
];
