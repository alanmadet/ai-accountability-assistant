import os
import json

from dotenv import load_dotenv

from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)


def analyze_email(email: str, today: str) -> list:

    print("EMAIL SENT TO LLM:")
    print(email)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": f"""
                You are Beacon, an AI executive assistant that reads a
                user's email and decides whether it deserves the user's
                attention today. You are not a classifier — you are
                deciding what a good assistant would flag for their boss.

                Today's date is {today}. Use it to resolve relative dates
                ("by Thursday", "in 2 weeks") into absolute ISO 8601
                datetimes (YYYY-MM-DDTHH:MM:SS). If no specific deadline
                is mentioned, deadline must be null.

                Ask yourself for this email:
                - Does the user need to act (reply, pay, complete a form)?
                - Is someone waiting on the user's response?
                - Is there a deadline, expiration, or time-sensitive window?
                - Is this purely informational with nothing to do? If so,
                  produce no notification for it.
                - Could this matter later even if not urgent right now
                  (e.g. a confirmed flight, an RSVP, a delivery)?

                For every item worth surfacing, output an object with:
                - title: short, specific, human-readable (e.g.
                  "Reply to recruiter about interview availability")
                - summary: 1-2 sentence plain-language summary of the email
                - reason: 1 sentence on why this deserves the user's
                  attention right now (the "why this matters")
                - kind: one of "recruiter", "bill", "medical", "deadline",
                  "travel", "package", "event", "subscription",
                  "reply_needed", "waiting_on", "other"
                - urgency: "high_priority" if the user must act soon or
                  someone is waiting on them; "upcoming" if it's
                  time-relevant but not urgent yet (travel, reservations,
                  returns, events)
                - confidence: integer 0-100, how confident you are this
                  genuinely deserves the user's attention
                - deadline: ISO 8601 datetime or null
                - recommended_actions: array, subset of
                  ["draft_reply", "open_email", "snooze", "dismiss",
                  "add_to_calendar"].
                  Only include "draft_reply" if the user plausibly needs
                  to write a reply. Only include "add_to_calendar" if
                  deadline is set AND this represents something
                  calendar-worthy — a flight, appointment, reservation,
                  event, or a hard due date — not a vague or informational
                  deadline.

                Return ONLY valid JSON of the form:
                {{"notifications": [ {{...}}, ... ]}}

                If nothing in this email deserves attention, return
                {{"notifications": []}}.

                Example:

                Email: "Can you send the updated proposal by Friday?"
                Result:
                {{"notifications": [
                  {{"title": "Send updated proposal by Friday",
                    "summary": "A colleague is asking for the updated proposal.",
                    "reason": "You were directly asked to send this by a deadline.",
                    "kind": "reply_needed",
                    "urgency": "high_priority",
                    "confidence": 90,
                    "deadline": "2026-08-07T23:59:00",
                    "recommended_actions": ["draft_reply", "open_email", "snooze", "dismiss"]}}
                ]}}

                Example:

                Email: "Your flight to NYC on June 25 is confirmed."
                Result:
                {{"notifications": [
                  {{"title": "NYC flight confirmed for June 25",
                    "summary": "Your flight booking to NYC on June 25 is confirmed.",
                    "reason": "Upcoming travel worth keeping on your radar.",
                    "kind": "travel",
                    "urgency": "upcoming",
                    "confidence": 80,
                    "deadline": "2026-06-25T00:00:00",
                    "recommended_actions": ["open_email", "dismiss", "add_to_calendar"]}}
                ]}}
                """
            },
            {
                "role": "user",
                "content": email
            }
        ]
    )

    raw = response.choices[0].message.content

    print("RAW LLM RESPONSE:")
    print(raw)

    if not raw:
        print("EMPTY LLM RESPONSE")
        return []

    try:
        parsed = json.loads(raw)
        notifications = parsed.get("notifications", [])

        if not isinstance(notifications, list):
            return []

        return notifications

    except Exception as e:

        print("JSON PARSE ERROR")
        print(e)

        return []


def generate_reply_draft(email: str, notification_title: str) -> str:

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Beacon, an AI executive assistant. Draft a "
                    "short, professional reply to the email below on the "
                    "user's behalf, addressing the following item: "
                    f"\"{notification_title}\". Write only the reply body, "
                    "no subject line, no placeholders in brackets unless "
                    "truly necessary."
                )
            },
            {
                "role": "user",
                "content": email
            }
        ]
    )

    return response.choices[0].message.content or ""


def generate_insights(candidates: list) -> list:

    if not candidates:
        return []

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": """
                You are Beacon, an AI executive assistant. You are given
                candidate signals derived from a user's inbox history
                (senders, message counts, days since last contact,
                whether the user has replied). Pick the most relevant
                ones (at most 8) and phrase them as natural, concise
                insights a thoughtful assistant would mention, e.g.
                "You haven't replied to Sarah in 11 days" or
                "John has emailed you 4 times this week". Skip anything
                that isn't actually interesting or actionable. Do not
                invent facts not supported by the candidate data.

                For each chosen insight, return an object with:
                - title: the natural-language insight (one sentence)
                - description: optional one more sentence of detail, or
                  empty string
                - insight_type: one of "relationship", "high_volume",
                  "waiting_on"
                - subject_key: the candidate's subject_key value, unchanged
                - confidence: integer 0-100 based only on evidence strength
                - actionability: number 0-1
                - urgency: number 0-1
                - novelty: number 0-1; repeated volume alone should be low
                - evidence_email_ids: copy the candidate's email_ids unchanged

                Return ONLY valid JSON of the form:
                {"insights": [ {...}, ... ]}
                """
            },
            {
                "role": "user",
                "content": json.dumps(candidates)
            }
        ]
    )

    raw = response.choices[0].message.content

    if not raw:
        return []

    try:
        parsed = json.loads(raw)
        insights = parsed.get("insights", [])
        return insights if isinstance(insights, list) else []

    except Exception as e:
        print("INSIGHT JSON PARSE ERROR")
        print(e)
        return []


def chunk_text(text: str, chunk_size: int = 1500, overlap: int = 150) -> list:

    if not text or not text.strip():
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap

    return chunks


def embed_text(text: str) -> list:

    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )

    return response.data[0].embedding


def generate_answer(question: str, context_chunks: list) -> str:

    context = "\n\n---\n\n".join(context_chunks)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Beacon, an AI assistant that helps users "
                    "understand their email inbox. Answer the user's question "
                    "using ONLY the email context provided. If the answer "
                    "cannot be found in the provided emails, say so clearly. "
                    "Be concise and direct."
                )
            },
            {
                "role": "user",
                "content": (
                    f"Context (emails from inbox):\n\n{context}"
                    f"\n\nQuestion: {question}"
                )
            }
        ]
    )

    return response.choices[0].message.content
