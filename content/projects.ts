export type Project = {
  tag: string; // short label printed on the crate (≤ 11 chars)
  name: string;
  year: number; // which step of the timeline it sits on
  blurb: string;
  stack: string;
  stat?: string;
  links?: { label: string; href: string }[];
};

const gh = (repo: string) => ({ label: "github", href: `https://github.com/Bigguysahaj/${repo}` });

// At most 3 per year. Order within a year = left to right.
export const PROJECTS: Project[] = [
  {
    tag: "SHRAVAN",
    name: "Shravan",
    year: 2022,
    blurb: "Elderly physiotherapy app: computer vision tracks exercises, range of motion and reps, and reports go to the family physiotherapist.",
    stack: "python · tensorflow · mediapipe · docker",
    links: [gh("SHRAVAN--elderly-physiotherapy-app")],
  },
  {
    tag: "SELF-CAR",
    name: "Self-learning car",
    year: 2022,
    blurb: "A car that learns to weave through oncoming traffic, using a neural network written from scratch with no ML libraries.",
    stack: "javascript · neural nets from scratch",
    links: [{ label: "demo", href: "https://self-learning-car.vercel.app/" }, gh("self-learning-car")],
  },
  {
    tag: "ICPC '22",
    name: "ACM-ICPC 2022",
    year: 2022,
    blurb: "Certificate of achievement at ACM-ICPC 2022. Years of competitive programming behind it.",
    stack: "c++ · algorithms · data structures",
    links: [gh("Competitive-coding")],
  },
  {
    tag: "GARUD.AI",
    name: "Garud.ai",
    year: 2023,
    blurb: "Surveillance as a service: flags threats in camera footage and summarises a whole day into a daily report. Built as founder, through buildspace Nights & Weekends.",
    stack: "next.js · llms · computer vision · hugging face",
    links: [{ label: "site", href: "https://garudai.vercel.app/" }, gh("garudtech")],
  },
  {
    tag: "BOOKBRAINZ",
    name: "MetaBrainz / BookBrainz",
    year: 2023,
    blurb: "Open-source contribution to BookBrainz (MetaBrainz): placeholder text for empty sections.",
    stack: "javascript · react · open source",
    links: [{ label: "merged PR", href: "https://github.com/metabrainz/bookbrainz-site/pull/983" }],
  },
  {
    tag: "DESISUBS",
    name: "DesiSubtitles",
    year: 2023,
    blurb: "Hinglish subtitles inside Netflix's own subtitle toggle. Built for then director of product management in Hackerrank.",
    stack: "javascript · llm · chrome extension",
    links: [{ label: "site", href: "https://bettersubtitles.vercel.app" }, gh("transliteration-server")],
  },
  {
    tag: "THREE.JS",
    name: "three.js core contribution",
    year: 2024,
    blurb: "Added vertex-color support to three.js's USDZExporter. Merged and shipped in r163.",
    stack: "javascript · usdz · 3d",
    stat: "merged into r163",
    links: [{ label: "merged PR", href: "https://github.com/mrdoob/three.js/pull/27943" }],
  },
  {
    tag: "CAMPUS",
    name: "Campus",
    year: 2024,
    blurb: "Spatial bookmark explorer for researchers: links drawn as a 3D scatter of synapses, with RAG on top. Got investor interest.",
    stack: "next.js · three.js · pinecone · openai embeddings",
  },
  {
    tag: "IMAGE→3D",
    name: "Single image → 3D",
    year: 2024,
    blurb: "Internship at a 3D/AI startup: spatial generation from a single image, an Electron desktop app, a visionOS app, and a USDZ coloured-mesh export pipeline.",
    stack: "electron · react · typescript · swift",
  },
  {
    tag: "JACOBI",
    name: "Jacobi Robotics",
    year: 2025,
    blurb: "Since Oct 2024, at Jacobi from its early stage: a real-time digital twin and operator studio for industrial palletizing, C++/Python simulation and motion-planning integration, and production apps and infrastructure.",
    stack: "c++ · python · three.js · aws",
    links: [{ label: "jacobi", href: "https://jacobirobotics.com" }],
  },
  {
    tag: "FREELANCE",
    name: "Freelance",
    year: 2025,
    blurb: "Freelance work for clients across many stacks.",
    stack: "python · c++ · ts · java · go · rust · blockchain",
    stat: "20+ gigs completed",
  },
  {
    tag: "MUSICSPACE",
    name: "music-space",
    year: 2026,
    blurb: "Local AI music generation (YuE2) on a 4 GB RTX 3050, controlled from your phone through a Cloudflare bridge.",
    stack: "python · local llms · cloudflare · cuda",
    links: [gh("music-space")],
  },
  {
    tag: "GHOST-DB",
    name: "Indian Ghost Database",
    year: 2026,
    blurb: "A catalogue of Indian folklore: 84 ghosts, spirits and where to find them.",
    stack: "python · web",
    links: [{ label: "site", href: "https://indian-ghost-database.vercel.app" }, gh("indian-ghost-database")],
  },
  {
    tag: "THIS SITE",
    name: "This site",
    year: 2026,
    blurb: "ASCII robots built on hand-written forward and inverse kinematics. The arm that just handed you this is one of them.",
    stack: "next.js · three.js · typescript",
  },
];
