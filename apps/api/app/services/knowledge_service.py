import re
import math
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc
from ..models import KnowledgeSource, KnowledgeChunk, KnowledgeSourceStatus
from ..logging import logger

def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()

def estimate_token_count(text: str) -> int:
    return math.ceil(len(text) / 4)

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict[str, Any]]:
    normalized = normalize_text(text)
    words = normalized.split()
    if not words:
        return []

    chunks = []
    start = 0
    chunk_index = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]
        content = " ".join(chunk_words)

        chunks.append({
            "content": content,
            "chunkIndex": chunk_index,
            "tokenCount": estimate_token_count(content)
        })

        chunk_index += 1
        start += (chunk_size - overlap)
        if start >= len(words):
            break
        if chunk_size <= overlap:
            break

    return chunks

# Comprehensive multilingual stopword dictionary (Conversational / Non-content tokens)
MULTILINGUAL_STOPWORDS = {
    # English
    "what", "which", "where", "when", "who", "whom", "how", "why", "is", "are", "am",
    "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "about", "into", "through", "during", "before", "after", "above",
    "below", "under", "again", "further", "then", "once", "here", "there", "all",
    "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "can", "will", "just",
    "should", "now", "tell", "please", "me", "us", "you", "your", "my", "give", "show",
    "available", "know", "want", "need", "like", "get", "list", "types",
    
    # Marathi (Devanagari)
    "काय", "आहे", "आहेत", "होती", "होते", "होता", "आणि", "व", "की", "मला", "आम्हाला",
    "सांगा", "कोणते", "कोणती", "कोणता", "कोणत्या", "उपलब्ध", "हवे", "हवा", "करा", "करायची", "करायचे",
    "द्या", "सांगू", "शकता", "माहिती", "का", "ना", "तर", "पण", "हे", "ती", "तो", "ते",
    "तुमचे", "तुमचा", "तुमची", "इथे", "तिथे", "काही", "कसे", "किती", "आहात", "असेल",
    "असावे", "असू", "शकतो", "शकते", "हवं", "काही", "थोडं", "कृपया", "प्रकार",
    
    # Hindi (Devanagari)
    "क्या", "है", "हैं", "था", "थी", "थे", "और", "तथा", "या", "की", "का", "के", "को",
    "से", "में", "पर", "मुझे", "हमें", "बताइए", "बताओ", "बताएं", "चाहिए", "करना",
    "उपलब्ध", "दीजिए", "दे", "सकते", "सकता", "सकती", "आपका", "आपकी", "आपके", "यहाँ",
    "वहाँ", "कुछ", "कैसे", "कितना", "कृपया", "होगा", "होगी", "होंगे", "प्रकार",
    
    # Gujarati (Devanagari/Gujarati script)
    "શું", "છે", "અને", "કે", "મને", "કહો", "આપો", "તમારું", "તમારા", "અહીં", "ત્યાં",
    
    # Hinglish / Marathish (Latin script transliteration)
    "kya", "hai", "hain", "tha", "thi", "aur", "ya", "ki", "ka", "ke", "ko", "se", "mein",
    "mujhe", "batao", "bataiye", "chahiye", "karna", "de", "sakte", "sakti",
    "aapka", "aapki", "aapke", "yahan", "vahan", "kuch", "kaise", "kitna", "kay", "aahe",
    "aahet", "hoti", "hote", "aani", "mala", "sanga", "konte", "konti", "konta", "kontya", "uplabdh",
    "have", "kara", "karaychi", "dya", "shakta", "shakto", "mahiti", "tumche", "tumcha",
    "tumchi", "ithe", "tithe", "kiti", "krupaya", "prakar"
}

# Cross-lingual concept mapping across ALL knowledge domains
CROSS_LINGUAL_CONCEPT_MAP = {
    # 1. Treatments, Procedures, Services & Clinical Care
    "treatment": ["treatment", "treatments", "procedure", "procedures", "service", "services", "care", "cure", "therapy", "surgery", "operation", "उपचार", "ट्रीटमेंट", "ट्रीटमेंट्स", "इलाज", "सेवा", "सुविधा", "उपचारपद्धती", "पद्धती"],
    "service": ["service", "services", "treatment", "treatments", "facility", "facilities", "offering", "offerings", "सेवा", "सेवाएं", "सुविधा", "ट्रीटमेंट", "उपचार"],
    "root canal": ["root canal", "rct", "endodontic", "pulp", "रूट कॅनल", "रूट केनाल", "दाताची नस", "नस"],
    "implant": ["implant", "implants", "prosthodontic", "tooth replacement", "artificial tooth", "इम्प्लांट", "इम्प्लांट्स", "नवीन दात", "कृत्रिम दात"],
    "whitening": ["whitening", "teeth whitening", "bleaching", "cosmetic", "व्हाइटनिंग", "दात पांढरे करणे", "चमकवणे"],
    "cleaning": ["cleaning", "teeth cleaning", "scaling", "polishing", "oral hygiene", "क्लीनिंग", "क्लिनिंग", "स्केलिंग", "दात साफ करणे", "सफाई"],
    "braces": ["braces", "aligners", "invisalign", "orthodontic", "clips", "wire", "ब्रेसेस", "अलाइनर्स", "दातांची क्लिप", "क्लिप"],
    "extraction": ["extraction", "tooth removal", "wisdom tooth", "remove tooth", "दाढ काढणे", "दात काढणे", "निष्कासन"],
    "filling": ["filling", "fillings", "cavity", "decay", "restoration", "composite", "फिलिंग", "दात भरणे", "सिमेंट भरणे", "कॅव्हिटी"],
    "crown": ["crown", "bridge", "caps", "cap", "कॅप", "क्राउन", "ब्रिज"],
    "xray": ["xray", "x-ray", "radiograph", "scan", "opg", "cbct", "एक्सरे", "एक्स-रे", "स्कॅन"],
    "consultation": ["consultation", "checkup", "check up", "examination", "tapasni", "तपासणी", "सल्ला", "कन्सल्टेशन", "पडताळणी"],
    "pain": ["pain", "ache", "toothache", "sensitivity", "swelling", "bleeding", "वेदना", "त्रास", "दुखणे", "दातदुखी", "सूज", "रक्त"],
    
    # 2. Pricing, Cost, Fees, Packages & Payment
    "price": ["price", "pricing", "cost", "costs", "fee", "fees", "charge", "charges", "rate", "rates", "bill", "billing", "amount", "payment", "खर्च", "किंमत", "दर", "फी", "फीस", "पैसे", "चार्ज", "चार्जेस", "मूल्य", "दाम"],
    "cost": ["cost", "costs", "price", "pricing", "fee", "fees", "charge", "charges", "rate", "rates", "खर्च", "किंमत", "दर", "फीस", "पैसे", "पैसे किती", "किती रुपये", "दाम"],
    "discount": ["discount", "offer", "concession", "scheme", "सूट", "ऑफर", "सवलत"],
    "emi": ["emi", "installment", "installments", "loan", "हप्ता", "किस्त"],
    "insurance": ["insurance", "mediclaim", "tpa", "policy", "विमा", "इन्शुरन्स"],
    
    # 3. Timings, Hours, Days, Shifts & Holidays
    "timing": ["timing", "timings", "time", "times", "hours", "hour", "open", "opening", "close", "closing", "schedule", "working hours", "वेळ", "वेळा", "टायमिंग", "टाइमिंग", "समय", "उघडण्याची वेळ", "चालू"],
    "hours": ["hours", "timing", "timings", "schedule", "open", "close", "वेळ", "टायमिंग", "समय"],
    "open": ["open", "opening", "working", "start", "उघडते", "उघडतं", "उघडे", "सुरू", "चालू", "खुलना"],
    "close": ["close", "closing", "shut", "off", "बंद", "बंद होते"],
    "holiday": ["holiday", "holidays", "sunday", "sundays", "weekend", "off day", "सुट्टी", "रविवार", "वार", "छुट्टी"],
    
    # 4. Doctor, Dentist, Staff & Qualifications
    "doctor": ["doctor", "doctors", "dr", "dentist", "dentists", "surgeon", "specialist", "specialists", "physician", "expert", "डॉक्टर", "डेंटिस्ट", "वैद्य", "तज्ज्ञ", "सर्जन", "दंतवैद्य"],
    "dentist": ["dentist", "dentists", "doctor", "specialist", "डेंटिस्ट", "डॉक्टर", "दंतचिकित्सक", "दंतवैद्य"],
    "qualification": ["qualification", "degree", "experience", "education", "bds", "mds", "fellowship", "शिक्षण", "पदवी", "अनुभव", "पात्रता"],
    "staff": ["staff", "team", "assistant", "nurse", "hygienist", "कर्मचारी", "स्टाफ", "टीम"],
    
    # 5. Location, Address, Landmark, Directions & Parking
    "address": ["address", "location", "landmark", "directions", "route", "place", "where", "map", "pin", "area", "city", "branch", "building", "floor", "road", "street", "near", "opposite", "पत्ता", "ठिकाण", "पत्ता सांगा", "पत्ता काय", "रस्ता", "इमारत", "जवळ", "समोर", "जागा", "पता", "कहाँ"],
    "location": ["location", "address", "place", "where", "directions", "area", "landmark", "ठिकाण", "पत्ता", "कुठे", "जागा", "कहाँ", "किधर"],
    "parking": ["parking", "park", "vehicle", "car parking", "bike parking", "पार्किंग", "गाडी लावायची जागा"],
    "directions": ["directions", "route", "how to reach", "way", "मार्ग", "दिशा", "रस्ता", "कसे पोहोचायचे"],
    
    # 6. Appointments, Booking, Rescheduling & Policies
    "appointment": ["appointment", "appointments", "book", "booking", "slot", "slots", "reserve", "reservation", "schedule", "अपॉइंटमेंट", "बुकिंग", "बुक", "वेळ घेणे", "स्लॉट"],
    "cancel": ["cancel", "cancellation", "reschedule", "change time", "रद्द", "बदलणे", "कॅन्सल"],
    "emergency": ["emergency", "urgent", "immediate", "walk-in", "walk in", "तातडीने", "इमर्जन्सी", "तातडीची", "त्वरित"],
    "policy": ["policy", "policies", "rules", "terms", "conditions", "protocol", "guidelines", "नियम", "अटी", "नियम व अटी", "मार्गदर्शक तत्त्वे"],
    
    # 7. Hygiene, Cleanliness, Safety & Equipment
    "hygiene": ["hygiene", "cleanliness", "sterilization", "autoclave", "safety", "sanitization", "स्वच्छता", "सुरक्षा", "जंतुनाशक", "सफाई"],
    "equipment": ["equipment", "technology", "machine", "tools", "digital", "तंत्रज्ञान", "मशिन", "साधनसामग्री", "उपकरणे"],
    
    # 8. Clinic Overview & General Information
    "about": ["about", "overview", "introduction", "details", "info", "information", "background", "history", "profile", "clinic", "hospital", "माहिती", "बद्दल", "क्लिनिक", "दवाखाना", "ओळख", "स्वरूप"],
    "clinic": ["clinic", "hospital", "center", "centre", "practice", "dental clinic", "क्लिनिक", "दवाखाना", "हॉस्पिटल", "केंद्र"]
}

# Build reverse lookup map for fast multi-word & single-word concept resolution
_CONCEPT_REVERSE_MAP = {}
for concept_key, syns in CROSS_LINGUAL_CONCEPT_MAP.items():
    for syn in syns:
        _CONCEPT_REVERSE_MAP[syn.lower()] = concept_key

def expand_query_terms(query: str) -> tuple:
    """Extract clean keywords and expand cross-lingual concepts across all domains."""
    query_lower = query.lower()
    raw_tokens = [w for w in re.split(r'[\s,?.!\'"()\[\]{}:;/\\]+', query_lower) if w]
    
    # Filter stopwords
    content_tokens = [t for t in raw_tokens if t not in MULTILINGUAL_STOPWORDS]
    if not content_tokens:
        content_tokens = raw_tokens  # Fallback if query was entirely stopwords
        
    expanded_terms = set(content_tokens)
    matched_concepts = set()
    
    # 1. Multi-word phrase matching against concept dictionary
    for syn, concept_key in _CONCEPT_REVERSE_MAP.items():
        if " " in syn and syn in query_lower:
            matched_concepts.add(concept_key)
            expanded_terms.update(CROSS_LINGUAL_CONCEPT_MAP[concept_key])
            
    # 2. Single-token concept matching
    for token in content_tokens:
        if token in _CONCEPT_REVERSE_MAP:
            concept_key = _CONCEPT_REVERSE_MAP[token]
            matched_concepts.add(concept_key)
            expanded_terms.update(CROSS_LINGUAL_CONCEPT_MAP[concept_key])
        else:
            # Substring matching for Indic or English stem variants
            for syn, concept_key in _CONCEPT_REVERSE_MAP.items():
                if len(syn) >= 4 and (syn in token or token in syn):
                    matched_concepts.add(concept_key)
                    expanded_terms.update(CROSS_LINGUAL_CONCEPT_MAP[concept_key])
                    break
                    
    return content_tokens, expanded_terms, matched_concepts


class KnowledgeService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_sources(self, tenant_id: uuid.UUID, agent_id: Optional[uuid.UUID] = None) -> List[Dict[str, Any]]:
        stmt = select(KnowledgeSource).where(KnowledgeSource.tenantId == tenant_id)
        if agent_id:
            stmt = stmt.where(KnowledgeSource.agentId == agent_id)
        stmt = stmt.order_by(desc(KnowledgeSource.createdAt))
        res = await self.session.execute(stmt)
        sources = res.scalars().all()

        return [
            {
                "id": str(s.id),
                "fileName": s.fileName,
                "fileType": s.fileType,
                "chunkCount": s.chunkCount,
                "status": s.status.value,
                "createdAt": s.createdAt.isoformat() if s.createdAt else None
            }
            for s in sources
        ]

    async def ingest_document(
        self,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        file_name: str,
        content: str,
        file_type: str = "txt"
    ) -> Dict[str, Any]:
        source = KnowledgeSource(
            tenantId=tenant_id,
            agentId=agent_id,
            fileName=file_name,
            filePath=f"uploads/{file_name}",
            fileType=file_type,
            status=KnowledgeSourceStatus.PROCESSING
        )
        self.session.add(source)
        await self.session.flush()

        chunks_data = chunk_text(content)
        source.chunkCount = len(chunks_data)
        source.status = KnowledgeSourceStatus.READY

        for c in chunks_data:
            chunk = KnowledgeChunk(
                sourceId=source.id,
                tenantId=tenant_id,
                agentId=agent_id,
                chunkIndex=c["chunkIndex"],
                content=c["content"],
                tokenCount=c["tokenCount"]
            )
            self.session.add(chunk)

        await self.session.commit()
        logger.info(f"Ingested document {file_name} with {len(chunks_data)} chunks for agent {agent_id}")

        return {
            "id": str(source.id),
            "fileName": source.fileName,
            "chunkCount": source.chunkCount,
            "status": source.status.value
        }

    async def get_source(self, tenant_id: uuid.UUID, agent_id: uuid.UUID, source_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        stmt = select(KnowledgeSource).where(
            KnowledgeSource.id == source_id,
            KnowledgeSource.tenantId == tenant_id,
            KnowledgeSource.agentId == agent_id
        )
        res = await self.session.execute(stmt)
        s = res.scalar_one_or_none()
        if not s:
            return None
        return {
            "id": str(s.id),
            "fileName": s.fileName,
            "fileType": s.fileType,
            "chunkCount": s.chunkCount,
            "status": s.status.value,
            "createdAt": s.createdAt.isoformat() if s.createdAt else None
        }

    async def delete_source(self, tenant_id: uuid.UUID, agent_id: uuid.UUID, source_id: uuid.UUID) -> bool:
        stmt = select(KnowledgeSource).where(
            KnowledgeSource.id == source_id,
            KnowledgeSource.tenantId == tenant_id,
            KnowledgeSource.agentId == agent_id
        )
        res = await self.session.execute(stmt)
        s = res.scalar_one_or_none()
        if not s:
            return False
        
        await self.session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.sourceId == source_id))
        await self.session.delete(s)
        await self.session.commit()
        return True

    async def retrieve_relevant_chunks(
        self,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        query: str,
        top_k: int = 3,
        threshold: float = 0.20
    ) -> List[Dict[str, Any]]:
        """Cross-lingual, stopword-aware keyword retrieval across all knowledge domains."""
        stmt = select(KnowledgeChunk).where(
            KnowledgeChunk.tenantId == tenant_id,
            KnowledgeChunk.agentId == agent_id
        ).order_by(KnowledgeChunk.chunkIndex.asc())
        res = await self.session.execute(stmt)
        chunks = res.scalars().all()

        if not chunks:
            return []

        query_lower = query.lower()
        content_tokens, expanded_terms, matched_concepts = expand_query_terms(query)

        scored = []
        for c in chunks:
            content_lower = c.content.lower()
            content_words = set(re.split(r'[\s,?.!\'"()\[\]{}:;/\\]+', content_lower))
            content_words.discard('')

            # 1. Exact raw query or cleaned query substring bonus
            phrase_bonus = 0.50 if (query_lower in content_lower or " ".join(content_tokens) in content_lower) else 0.0

            # 2. Multi-word / Concept phrase matches
            concept_phrase_matches = 0
            for term in expanded_terms:
                if " " in term and term in content_lower:
                    concept_phrase_matches += 1
            concept_phrase_bonus = min(concept_phrase_matches * 0.25, 0.50)

            # 3. Token & synset overlap
            matched_expanded = expanded_terms & content_words
            # Substring matching for terms inside chunk words
            sub_matches = sum(1 for t in expanded_terms if len(t) >= 4 and t in content_lower)

            overlap_count = len(matched_expanded) + sub_matches
            active_denominator = max(len(content_tokens), 1)

            token_score = min(overlap_count / (active_denominator * 2.0), 1.0)
            
            # Combine scores
            score = max(token_score * 0.70 + max(phrase_bonus, concept_phrase_bonus) * 0.30, phrase_bonus, concept_phrase_bonus if concept_phrase_matches else 0.0)
            score = round(min(score, 1.0), 3)

            if score >= threshold:
                scored.append({
                    "content": c.content,
                    "score": score,
                    "sourceId": str(c.sourceId),
                    "chunkIndex": c.chunkIndex
                })

        # Sort by score descending
        scored.sort(key=lambda x: x["score"], reverse=True)

        # Overview Fallback: If no chunk exceeded threshold, but agent has knowledge chunks,
        # return chunk 0 (overview/intro) so the agent has grounded clinic context
        if not scored and chunks:
            overview_chunk = chunks[0]
            logger.info(f"Fallback to overview chunk index 0 for query: '{query}'")
            return [{
                "content": overview_chunk.content,
                "score": 0.35,
                "sourceId": str(overview_chunk.sourceId),
                "chunkIndex": overview_chunk.chunkIndex
            }]

        return scored[:top_k]


