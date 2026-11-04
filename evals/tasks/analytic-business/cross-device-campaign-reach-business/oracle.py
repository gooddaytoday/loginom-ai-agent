from pathlib import Path
import csv

root = Path(__file__).resolve().parent
with (root / "data/identities.csv").open(encoding="utf-8", newline="") as source:
    identities = {row["device_id"]: row["person_id"] for row in csv.DictReader(source, delimiter=";")}
with (root / "data/campaigns.csv").open(encoding="utf-8", newline="") as source:
    campaigns = {row["campaign_id"]: [0, 0, set()] for row in csv.DictReader(source, delimiter=";")}
with (root / "data/impressions.csv").open(encoding="utf-8", newline="") as source:
    for row in csv.DictReader(source, delimiter=";"):
        campaign = campaigns[row["campaign_id"]]
        campaign[0] += 1
        person = identities.get(row["device_id"])
        if person is None:
            campaign[1] += 1
        else:
            campaign[2].add(person)
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["campaign_id", "impressions", "known_people", "unknown_impressions", "identified_impressions_per_person"])
    for campaign_id in sorted(campaigns):
        impressions, unknown, people = campaigns[campaign_id]
        frequency = f"{(impressions - unknown) / len(people):.15g}" if people else ""
        writer.writerow([campaign_id, impressions, len(people), unknown, frequency])
