import pytest

from src.dna.parser import parse_myheritage_csv


def _csv(*rows: str) -> bytes:
    return "\n".join(rows).encode()


def test_parses_valid_rows() -> None:
    data = _csv(
        "rs1;1;1000;AA;;;",
        "rs2;1;2000;AG;;;",
        "rs3;2;500;CC;;;",
    )
    records = parse_myheritage_csv(data)
    assert len(records) == 3
    # sorted by (chromosome, position_bp)
    assert records[0].chromosome == "1"
    assert records[0].position_bp == 1000
    assert records[2].chromosome == "2"


def test_skips_invalid_genotypes() -> None:
    data = _csv(
        "rs1;1;1000;AA;;;",
        "rs2;1;2000;--;;;",
        "rs3;1;3000;00;;;",
        "rs4;1;4000;NN;;;",
        "rs5;1;5000;;;;",  # empty genotype
        "rs6;1;6000;A;;;",  # single char
    )
    records = parse_myheritage_csv(data)
    assert len(records) == 1
    assert records[0].chromosome == "1"


def test_normalizes_allele_order() -> None:
    data = _csv("rs1;1;1000;GA;;;")
    records = parse_myheritage_csv(data)
    assert records[0].allele1 == "A"
    assert records[0].allele2 == "G"


def test_raises_on_empty_file() -> None:
    with pytest.raises(ValueError, match="prawidłowych"):
        parse_myheritage_csv(b"")


def test_raises_when_all_rows_invalid() -> None:
    data = _csv("rs1;1;1000;--;;;", "rs2;1;2000;NN;;;")
    with pytest.raises(ValueError):
        parse_myheritage_csv(data)


def test_parses_position_cm_when_present() -> None:
    data = _csv("rs1;1;1000;AA;12.5;;")
    records = parse_myheritage_csv(data)
    assert records[0].position_cm == pytest.approx(12.5)


def test_position_cm_is_none_when_missing() -> None:
    data = _csv("rs1;1;1000;AA;;;")
    records = parse_myheritage_csv(data)
    assert records[0].position_cm is None
