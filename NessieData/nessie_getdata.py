import requests
import json

# Replace YOUR_API_KEY with your actual API key
url = "http://api.nessieisreal.com/enterprise/bills?key=d0c6f2ca3ac98e9c182c8cdf7fc0ccfd"
response = requests.get(url)

if response.status_code == 200:
    data = response.json()
    with open("bill.json", "w") as outfile:
        json.dump(data, outfile, indent=2)
    print("Bill saved to bill.json")
else:
    print("Failed to retrieve data:", response.status_code)