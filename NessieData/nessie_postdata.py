from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/save_profile", methods=["POST"])
def save_profile():
    # Get the profile data sent from the client
    data = request.get_json()
    name = data.get("name")
    name_split = name.split()
    first_name = name_split[0]
    second_name = name_split[1]
    
    # Prepare the payload for the Nessie API
    payload = {
    "first_name": first_name,
    "last_name": second_name,
    "address": {
        "street_number" : "na",
        "street_name" : "na",
        "city": "Urbana",
        "state" : "IL",
        "zip": "61801"
    }
}
    url = "http://api.nessieisreal.com/customers?key=d0c6f2ca3ac98e9c182c8cdf7fc0ccfd" 
    
    response = requests.post(url, json=payload)

    if response.status_code == 201:
        print("Account created successfully!")
        print(response.json())
    else:
        print("Error creating account:")
        print(f"Status code: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    app.run(debug=True)