import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gmail_links import gmail_web_url


class GmailLinkTests(unittest.TestCase):
    def test_prefers_thread_without_fragment_dropping_account_redirect(self):
        url = gmail_web_url(
            "alan+beacon@example.com", "thread-123", "message-456", "id@example.com"
        )
        self.assertEqual(
            url,
            "https://mail.google.com/mail/u/0/#all/thread-123",
        )
        self.assertNotIn("authuser=", url)

    def test_uses_official_rfc822_search_when_api_ids_are_missing(self):
        url = gmail_web_url("me@example.com", None, None, "abc+123@example.com")
        self.assertEqual(
            url,
            "https://mail.google.com/mail/u/0/#search/"
            "rfc822msgid%3Aabc%2B123%40example.com",
        )


if __name__ == "__main__":
    unittest.main()
