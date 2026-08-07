// Schaetzt die Anrede (Herr/Frau) aus dem Vornamen -- reine Namens-Heuristik,
// kein Anspruch auf 100% Trefferquote. Wird nur verwendet, wenn noch keine
// Anrede gesetzt ist (anrede === "keine_angabe"); manuelle Angaben werden nie
// ueberschrieben (siehe anrede_quelle in der DB).
//
// Unklare / echte Unisex-Namen sind absichtlich NICHT gelistet, damit sie als
// "keine_angabe" stehen bleiben und von Hand nachgetragen werden koennen,
// statt eine falsche Anrede zu erzeugen.

const MAENNLICH = [
  "aaron","alexander","alfons","alfred","amon","andreas","anton","armin","arne","arno","artem",
  "benjamin","bernd","billy","björn","boris",
  "carsten","christian","christoph","claus","clemens",
  "daniel","david","denis","dirk","dominic","dominik","drew",
  "eugen",
  "fabian","felix","flavio","florian","frank",
  "gabriel","georg","georgios","gerald","gregor","gunter","günther",
  "heinz","holger","hubertus","hans",
  "ingo",
  "jan","jens","jochen","johann","jonas","jörg","julian","jürgen",
  "kai","kevin","kilian","konstantin","kurt",
  "lars","lorenz","lukas","lucas","lutz",
  "malte","manuel","marc","marcel","marco","marcus","marian","mark","markus","matthias","michael","moritz",
  "nicolas","nino","norbert",
  "olaf","oliver",
  "patric","patrick","peter","philipp",
  "rainer","ralf","reinhard","rené","robert","roland","rüdiger",
  "sebastian","shady","simon","stefan","steffen","stephan","steve",
  "thomas","thorben","thore","tilo","tim","timo","tobias","torsten",
  "ulf","urs",
  "volker",
  "walter","werner","wilhelm","wojtek","wolfgang",
  "yannik","yves",
  // haeufige weitere deutsche Vornamen (ueber den Bestand hinaus, fuer Neuanlagen)
  "achim","joachim","alwin","axel","berthold","carl","karl","detlef","dietmar","dieter","egon",
  "eberhard","erich","ernst","erwin","frieder","friedrich","fritz","gerd","gerhard","guido","günter",
  "hartmut","harald","heiko","helmut","herbert","hermann","horst","jakob","jonathan","josef","joseph",
  "klaus","leon","leonard","leonhard","ludwig","manfred","marius","max","maximilian","mirko",
  "niclas","niklas","noah","otto","paul","ralph","reiner","richard","rolf","rudolf","sascha",
  "sven","till","uwe","viktor","waldemar","willi",
];

const WEIBLICH = [
  "agnes","aiste","alexa","andrea","anika","anja","anne","annica","azzurra",
  "barbara","beate","bettina",
  "carina","carolin","caroline","cathi","cati","céline","claudia",
  "daniela","diana",
  "ellen","eveline",
  "fabienne","franziska",
  "heike",
  "irene",
  "jana","jeannine","jennifer","jenny","julia",
  "katerina","katharina","kati","katrin","kirstin",
  "laura","lisa","luci","lucy",
  "madeleine","manuela","maren","marie","marlene","martina","michaela","mirjam","monika","muriel",
  "nadine","nadja","naomi","nicole",
  "pauline","pia",
  "rebecca","riona","ronja","roxeanne",
  "sandra","stefanie","steffi","stella",
  "tabea","theresa",
  "ulrike",
  "vanessa","verena","veronika","viktoria","virginie",
  "yvonne",
  // haeufige weitere deutsche Vornamen (ueber den Bestand hinaus, fuer Neuanlagen)
  "alina","alexandra","angelika","anke","anna","annette","antje","astrid","birgit","brigitte",
  "christina","christiane","christine","cornelia","doris",
  "edith","elfriede","elisabeth","elke","emma","erika","erna",
  "gabriele","gerda","gertrud","gisela",
  "hannah","hanna","helga","hilde","hildegard",
  "ines","ingeborg","ingrid","isabel","isabell","isabelle",
  "jasmin","johanna","judith",
  "karin","karla","katja",
  "leonie","lena","lea","lia","luisa","louisa",
  "marion","marlies","meike","melanie","milena","mia",
  "petra",
  "regina","renate","rita","ruth",
  "sabine","sara","sarah","silke","simone","sofia","sophia","sophie","susanne","svenja",
  "tanja","tina",
  "ursula","ute",
  "waltraud",
];

const MAENNLICH_SET = new Set(MAENNLICH);
const WEIBLICH_SET = new Set(WEIBLICH);

/**
 * Schaetzt "Herr" / "Frau" aus einem Vornamen. Gibt null zurueck, wenn der
 * Name nicht sicher zuzuordnen ist (dann bleibt die Anrede auf "keine_angabe"
 * stehen und kann von Hand gesetzt werden).
 *
 * Behandelt zusammengesetzte Vornamen ("Anne-Katrin", "Urs Bruno", "Hans-Peter"),
 * indem zuerst der komplette String, dann der erste Teil geprueft wird.
 */
export function schaetzeAnredeAusVorname(vornameRoh: string): "Herr" | "Frau" | null {
  const vorname = (vornameRoh || "").trim().toLowerCase();
  if (!vorname) return null;

  const treffer = (kandidat: string): "Herr" | "Frau" | null => {
    if (WEIBLICH_SET.has(kandidat)) return "Frau";
    if (MAENNLICH_SET.has(kandidat)) return "Herr";
    return null;
  };

  const direkt = treffer(vorname);
  if (direkt) return direkt;

  const ersterTeil = vorname.split(/[\s-]+/)[0];
  if (ersterTeil && ersterTeil !== vorname) {
    const teilTreffer = treffer(ersterTeil);
    if (teilTreffer) return teilTreffer;
  }

  return null;
}
