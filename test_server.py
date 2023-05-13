from flask import Flask, render_template
import os
app = Flask(__name__, template_folder='./')

@app.route('/')
def index():
    return render_template("index.html")


if __name__=="__main__":
    app.debug = True
    app.run(port=5000)
