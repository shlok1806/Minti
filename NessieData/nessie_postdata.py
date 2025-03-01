import requests


url = "http://api.nessieisreal.com/customers?key=d0c6f2ca3ac98e9c182c8cdf7fc0ccfd"

payload = {
    "first_name": "Alexandra",
    "last_name": "Ratowski",
    "address": {
        "street_number" : "na",
        "street_name" : "na",
        "city": "Urbana",
        "state" : "IL",
        "zip": "61801"
    }
}

response = requests.post(url, json=payload)

if response.status_code == 201:
    print("Account created successfully!")
    print(response.json())
else:
    print("Error creating account:")
    print(f"Status code: {response.status_code}")
    print(response.text)