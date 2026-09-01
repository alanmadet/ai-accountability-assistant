import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from retrieval import reciprocal_rank_fusion, search_terms


class RetrievalTests(unittest.TestCase):
    def test_keyword_candidate_can_promote_an_obvious_email(self):
        # A semantic-only result puts the refund email third. An exact amount
        # and merchant keyword match should promote it to the first result.
        semantic = ["travel", "newsletter", "acme-refund"]
        keyword = ["acme-refund"]
        merged = reciprocal_rank_fusion([semantic, keyword], [1.0, 1.25])
        self.assertEqual(merged[0], "acme-refund")

    def test_query_normalization_preserves_useful_email_and_amount_tokens(self):
        self.assertEqual(
            search_terms("Refund from ACME for $184.00 to Me@Example.com?"),
            ["refund", "from", "acme", "for", "$184.00", "to", "me@example.com"],
        )


if __name__ == "__main__":
    unittest.main()
