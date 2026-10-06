#!/usr/bin/env python3
"""Assemble the reviewed lesson drafts into the app's literacy corpus and the traceability docs.

Usage: python3 tools/literacy/assemble.py [--check]
Reads apps/web/content/literacy/area-<id>.json in course order; writes
apps/web/src/literacy/{corpus.en.ts,corpus.fr.ts,sources.ts,path.ts} and
docs/literacy/{course-v1.md,evidence-v1.md}. With --check, validates and prints a report only.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DRAFTS = ROOT / "apps" / "web" / "content" / "literacy"
OUT = ROOT / "apps" / "web" / "src" / "literacy"
DOCS = ROOT / "docs" / "literacy"
AREAS = ["start", "manage", "save", "bank", "borrow", "protect", "invest", "grow"]
LIMITS = {"title": 8, "summary": 40, "example": 70, "action": 25, "watchOut": 28}
POINT_LIMIT = 32
FIELDS = ["title", "summary", "points", "example", "action", "watchOut", "aliases"]
META = re.compile(r"\b(our sources|the notes|we found|our research|nos sources|les notes|nos recherches)\b", re.I)
# One canonical entry for sources that several writers registered differently.
CANONICAL = {
    "ilo-ci-2023": {"name": "OIT — Éducation financière pour les cultivateurs et les travailleurs ruraux en Côte d'Ivoire, Livret de l'apprenant (2023)", "url": "https://www.ilo.org/sites/default/files/wcmsp5/groups/public/%40ed_emp/%40emp_ent/documents/instructionalmaterial/wcms_900276.pdf"},
    "aflatoun": {"name": "Aflatoun International — AflaYouth, manuel (extraits, 2024)", "url": "https://aflatoun.org/wp-content/uploads/2026/01/AflaYouth_FR_AllBooks_Sample.pdf"},
    "amf-fr": {"name": "AMF (France) — guides pour les épargnants : diversification, rendement et risque, horizon de placement, frais", "url": "https://www.amf-france.org/sites/institutionnel/files/pdf/71321/fr/Bien_diversifier_son_epargne_pour_atteindre_ses_objectifs.pdf"},
    "amf-umoa": {"name": "AMF-UMOA — espace épargnant (guide, glossaire), vérification d'agrément, réclamations (Instruction n°50/2016), communiqués", "url": "https://www.amf-umoa.org/accueil/epargnant"},
    "asic-moneysmart": {"name": "ASIC Moneysmart (Australia) — budgeting and investing guides", "url": "https://moneysmart.gov.au/how-to-invest/develop-an-investing-plan"},
    "banque-de-france": {"name": "Banque de France — ABC de l'économie et Mes questions d'argent", "url": "https://www.mesquestionsdargent.fr"},
    "bceao": {"name": "BCEAO — listes des établissements agréés, situation de la microfinance, indicateurs d'inclusion financière", "url": "https://www.bceao.int/fr/content/etablissements-de-monnaie-electronique"},
    "bpbf": {"name": "Banque Postale du Burkina Faso — conditions publiées (2026)", "url": "https://www.banquepostale.bf/"},
    "brvm": {"name": "BRVM — Comment investir à la BRVM, règles de négociation, bulletin officiel de la cote", "url": "https://www.brvm.org/fr/comment-investir-la-brvm"},
    "cfpb-ymyg": {"name": "CFPB — Your Money, Your Goals: A financial empowerment toolkit (2020)", "url": "https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_financial-empowerment_toolkit.pdf"},
    "cgi-bf": {"name": "Direction Générale des Impôts du Burkina Faso — Code général des impôts (éditions 2023 et 2024)", "url": "https://dgi.bf/verification/CGI"},
    "commission-bancaire": {"name": "Commission Bancaire de l'UMOA — rapport annuel 2025 ; Circulaire n°002-2020/CB/C sur les réclamations", "url": "https://www.cb-umoa.org/sites/default/files/RAPPORT%20ANNUEL%202025%20DE%20LA%20COMMISSION%20BANCAIRE.pdf"},
    "coris-bourse": {"name": "SGI Coris Bourse — pages pour les particuliers (lues le 3 octobre 2026)", "url": "https://coris-bourse.com/nos-services-produits/particuliers"},
    "dgjep-2018": {"name": "Ministère de la Jeunesse (DGJEP, Burkina Faso) — Formation des jeunes promoteurs en éducation financière, cahier du participant (2018 ; copie non officielle)", "url": "https://fr.scribd.com/document/898056788/Cahier-Participant"},
    "fdic-money-smart": {"name": "FDIC — Money Smart for Young Adults, participant guides (2022)", "url": "https://www.fdic.gov/consumer-resource-center/money-smart-young-adults"},
    "fgdr-umoa-statutes-2018": {"name": "FGDR-UMOA — Statuts du Fonds de Garantie des Dépôts et de Résolution (2018)", "url": "https://www.fgd-umoa.org/wp-content/uploads/2024/09/Statuts-FGDR-UMOA-2018-1-min-compresse.pdf"},
    "findex-2025": {"name": "World Bank — Global Findex 2025, Little Data Book on Financial Inclusion (survey year 2024)", "url": "https://thedocs.worldbank.org/en/doc/be6615202d1f08a25855c8ac2d615122-0050012025/related/Little-Data-Book-2025-Web.pdf"},
    "finscope-bf-2016": {"name": "FinMark Trust — FinScope Burkina Faso 2016, Youth Dashboard", "url": "https://www.finmark.org.za/system/documents/files/000/000/235/original/Burkina-Faso_Dashboard_Youth_English.pdf"},
    "iefp": {"name": "La finance pour tous (IEFP) — fiches et modules pédagogiques", "url": "https://www.lafinancepourtous.com"},
    "jpal-ipa": {"name": "J-PAL et IPA — évaluations sur l'épargne (bulletin 2021 et fiches d'évaluation)", "url": "https://www.povertyactionlab.org/sites/default/files/publication/Commitment-Savings-Bulletin-5.21.21.pdf"},
    "la-poste-bf": {"name": "La Poste Burkina Faso — conditions des comptes d'épargne (2023)", "url": "https://laposte.bf/epargne-ordinaire/"},
    "lefaso": {"name": "LeFaso.net — articles et commentaires de lecteurs (2012–2026)", "url": "https://lefaso.net"},
    "oqsf-bf": {"name": "OQSF-BF (Observatoire de la qualité des services financiers) — d'après la presse (Sidwaya, AllAfrica)", "url": "https://fr.allafrica.com/stories/202511060327.html"},
    "rcpb": {"name": "Réseau des Caisses Populaires du Burkina — plaquette 2025", "url": "https://rcpb.bf/wp-content/uploads/2026/01/Plaquette_RCPB_VF_2025.pdf"},
    "sec-investor-gov": {"name": "US SEC, Investor.gov — Beginners' Guide to Asset Allocation, Diversification, and Rebalancing; Understanding Fees", "url": "https://www.investor.gov/additional-resources/general-resources/publications-research/info-sheets/beginners-guide-asset"},
    "sec-roadmap": {"name": "US SEC — Saving and Investing: A Roadmap To Your Financial Security (2011)", "url": "https://www.sec.gov/investor/pubs/sec-guide-to-savings-and-investing.pdf"},
    "st-pif-2023": {"name": "ST-PIF (Burkina Faso) — Éducation financière, cahier du participant (2023 ; copie non officielle)", "url": "https://fr.scribd.com/document/744857863/inclusion-financiere"},
    "umoa-usury-2025": {"name": "Conseil des Ministres de l'UMOA — Décision n°19 du 29/12/2025 fixant le taux de l'usure", "url": "https://www.bceao.int/sites/default/files/2026-01/Decision-No19-du-29-12-2025_CMUMOA_fixant_le_taux_de_l-usure.pdf"},
}
BLOCKED_HOSTS = ("cnss.bf", "cnssbf.org", "coris-asset.com")  # seen defaced or compromised on 2026-10-03


def words(text):
    text = re.sub(r"(\d)[\s\xa0\u202f](\d{3})", r"\1\2", text)
    return len([w for w in re.split(r"\s+", text.strip()) if re.search(r"\w", w)])


def digits(text):
    return sorted(re.sub(r"[\s\xa0\u202f.,]", "", n) for n in re.findall(r"\d+(?:[\s\xa0\u202f.,]\d+)*", text))


def main():
    check_only = "--check" in sys.argv
    problems, warnings = [], []
    registry, lessons, seen, path = {}, [], set(), {}
    for area in AREAS:
        file = DRAFTS / f"area-{area}.json"
        if not file.exists():
            problems.append(f"missing draft: {file.name}")
            continue
        data = json.loads(file.read_text())
        for sid, entry in data.get("sourceRegistry", {}).items():
            entry = CANONICAL.get(sid, entry)
            url = (entry.get("url") or "").strip()
            if url and any(host in url for host in BLOCKED_HOSTS):
                warnings.append(f"{area}: source {sid} url dropped (site flagged): {url}")
                url = ""
            if sid in registry:
                if registry[sid]["name"] != entry["name"]:
                    warnings.append(f"registry {sid}: kept first name; {area} had a different one")
                if not registry[sid].get("url") and url:
                    registry[sid]["url"] = url
                continue
            registry[sid] = {"name": entry["name"].strip(), **({"url": url} if url else {})}
        path[area] = []
        for lesson in data["lessons"]:
            lid = lesson["id"]
            if lid in seen:
                problems.append(f"duplicate lesson id {lid} ({area})")
            seen.add(lid)
            path[area].append(lid)
            for sid in lesson["sources"]:
                if sid not in data.get("sourceRegistry", {}) and sid not in registry:
                    problems.append(f"{lid}: source {sid} not in registry")
            if not lesson.get("evidence"):
                problems.append(f"{lid}: no evidence entries")
            for lang in ("en", "fr"):
                unit = lesson[lang]
                for field in FIELDS:
                    if field not in unit or not unit[field]:
                        problems.append(f"{lid}.{lang}: missing {field}")
                if not 3 <= len(unit["points"]) <= 4:
                    problems.append(f"{lid}.{lang}: {len(unit['points'])} points")
                for field, limit in LIMITS.items():
                    if words(unit[field]) > limit + (3 if lang == "fr" else 0) + 4:
                        warnings.append(f"{lid}.{lang}.{field}: {words(unit[field])} words (limit {limit})")
                for point in unit["points"]:
                    if words(point) > POINT_LIMIT + 6:
                        warnings.append(f"{lid}.{lang}.point: {words(point)} words")
                blob = " ".join([unit["title"], unit["summary"], unit["example"], unit["action"], unit["watchOut"], *unit["points"]])
                if META.search(blob):
                    problems.append(f"{lid}.{lang}: meta wording: {META.search(blob).group(0)}")
            if digits(lesson["en"]["example"]) != digits(lesson["fr"]["example"]):
                problems.append(f"{lid}: example figures differ between EN and FR")
            lessons.append((area, lesson))

    print(f"lessons: {len(lessons)} in {len([a for a in AREAS if path.get(a)])} areas; sources: {len(registry)}")
    for w in warnings:
        print("  warn:", w)
    for p in problems:
        print("  PROBLEM:", p)
    if check_only or problems:
        sys.exit(1 if problems else 0)

    def unit_ts(area, lesson, lang):
        u = lesson[lang]
        return {"id": lesson["id"], "area": area, "locale": lang, "title": u["title"], "summary": u["summary"], "points": u["points"],
                "example": u["example"], "action": u["action"], "watchOut": u["watchOut"], "aliases": u["aliases"], "sources": lesson["sources"]}

    header = "// Generated by tools/literacy/assemble.py from apps/web/content/literacy/area-*.json. Do not edit by hand:\n// change the lesson at its source and regenerate, so the evidence table stays true.\n"
    for lang, name in (("en", "LITERACY_UNITS_EN"), ("fr", "LITERACY_UNITS_FR")):
        body = json.dumps([unit_ts(a, l, lang) for a, l in lessons], ensure_ascii=False, indent=2)
        (OUT / f"corpus.{lang}.ts").write_text(f'{header}import type {{ LiteracyUnit }} from "./corpus.js";\n\nexport const {name}: LiteracyUnit[] = {body};\n')
    (OUT / "sources.ts").write_text(f"{header}export type LiteracySource = {{ name: string; url?: string }};\n\nexport const LITERACY_SOURCES: Record<string, LiteracySource> = {json.dumps(registry, ensure_ascii=False, indent=2)};\n")
    (OUT / "path.ts").write_text(f"{header}export const LITERACY_PATH = {json.dumps(path, ensure_ascii=False, indent=2)} as const;\n")

    DOCS.mkdir(parents=True, exist_ok=True)
    course = ["# Literacy course v1 — lessons and their sources", "",
              "Quadrant: Reference · Generated from `apps/web/content/literacy/area-*.json` by `tools/literacy/assemble.py` (writer rules: `writer-brief.md`) · Research: `docs/research/2026-10-03-*.md` · Claim-level traceability: `evidence-v1.md`.", "",
              f"{len(lessons)} lessons in {len(path)} parts, English and French, written only from the cited sources (Y4NN, 2026-10-03: nothing from model knowledge). Not yet reviewed by a local expert.", "",
              "Since 2026-10-06 the lessons are the knowledge base of the tutor (\"Éducation financière\"), not pages in the app: the server retrieves them by embeddings (ADR-0013 amendment). After changing a lesson, regenerate with this script, then run `tools/literacy/embed.mjs`.", ""]
    for area in AREAS:
        course += [f"## {area}", "", "| Lesson | Title (EN) | Sources |", "| --- | --- | --- |"]
        course += [f"| `{l['id']}` | {l['en']['title']} | {', '.join(l['sources'])} |" for a, l in lessons if a == area]
        course.append("")
    course += ["## Sources", "", "| Id | Source | URL |", "| --- | --- | --- |"]
    course += [f"| `{sid}` | {e['name'].replace('|', '/')} | {e.get('url', '—')} |" for sid, e in sorted(registry.items())]
    (DOCS / "course-v1.md").write_text("\n".join(course) + "\n")

    ev = ["# Literacy course v1 — evidence table", "",
          "Quadrant: Reference · Generated with `course-v1.md`. One line per claim: what a lesson states, the source it rests on, and where in the research notes the supporting passage is (notes are kept locally in `research-sources/notes/`; they quote copyrighted material and are not published).", ""]
    for area, lesson in lessons:
        ev += [f"## {lesson['id']} ({area})", "", "| Claim | Source | Where |", "| --- | --- | --- |"]
        ev += [f"| {e['claim'].replace('|', '/')} | `{e['source']}` | {e['where'].replace('|', '/')} |" for e in lesson["evidence"]]
        ev.append("")
    (DOCS / "evidence-v1.md").write_text("\n".join(ev) + "\n")
    print("written:", ", ".join(str(p.relative_to(ROOT)) for p in [OUT / "corpus.en.ts", OUT / "corpus.fr.ts", OUT / "sources.ts", OUT / "path.ts", DOCS / "course-v1.md", DOCS / "evidence-v1.md"]))


if __name__ == "__main__":
    main()
