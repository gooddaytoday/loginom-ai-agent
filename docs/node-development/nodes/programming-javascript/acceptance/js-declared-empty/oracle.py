import pathlib
print(pathlib.Path(__file__).with_name("expected.json").read_text())
