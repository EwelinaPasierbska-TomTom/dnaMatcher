# ruff: noqa
from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

from src.dna import genome_tools as tools

VALID_ALLELES = {"A", "C", "G", "T"}


@dataclass
class snpMatchingResult:
    rsid: str
    position: str
    matching: str  # "none" | "half" | "full" | "empty"


@dataclass
class segment:
    startingPoint: str
    endPoint: str
    count: int
    type: str  # "none" | "half" | "full" | "empty" | "gap"
    length: Optional[float] = None
    density: Optional[float] = None


def getSnpMachting(snps: List[Any]) -> snpMatchingResult:
    if not snps:
        return snpMatchingResult(rsid="", position="", matching="empty")

    rsid = snps[0].rsid
    pos = snps[0].position

    for s in snps:
        if (
            getattr(s, "p1", None) not in VALID_ALLELES
            or getattr(s, "p2", None) not in VALID_ALLELES
        ):
            return snpMatchingResult(rsid=rsid, position=pos, matching="empty")

    if len(snps) <= 1:
        return snpMatchingResult(rsid=rsid, position=pos, matching="none")

    genos = [tuple(sorted((s.p1, s.p2))) for s in snps]
    if all(g == genos[0] for g in genos):
        return snpMatchingResult(rsid=rsid, position=pos, matching="full")

    for allele in VALID_ALLELES:
        if all((s.p1 == allele or s.p2 == allele) for s in snps):
            return snpMatchingResult(rsid=rsid, position=pos, matching="half")

    return snpMatchingResult(rsid=rsid, position=pos, matching="none")


def findMatchingBarCode(persons):
    phasedResults = {x: {} for x in range(1, 24)}
    for i in range(1, 24):
        common_keys = None
        for person in persons:
            keys = set(person.get(i).keys())
            common_keys = keys if common_keys is None else common_keys & keys
        if not common_keys:
            continue
        # Sortuj po pozycji genomowej (int), nie leksykograficznie po rsid
        chrom_data_ref = persons[0].get(i)
        common_keys = sorted(common_keys, key=lambda k: int(chrom_data_ref[k].position))
        dictPhased = phasedResults[i]
        for num in common_keys:
            singleSNPTable = [person.get(i).get(num) for person in persons]
            dictPhased[num] = getSnpMachting(singleSNPTable)
    return phasedResults


def segmentCreator(matchingBarCode):
    lenghThreshold = 0.01
    countThreshold = 2
    gap_threshold = 0.1
    anhor_threshold = 3.0
    none_threshold = 5.0
    segments = {x: {} for x in range(1, 23)}
    for i in range(1, 23):
        chrSegments = []
        chr_data = matchingBarCode.get(i)
        if not chr_data:
            continue
        sorted_snps = sorted(chr_data.values(), key=lambda x: int(x.position))
        if not sorted_snps:
            continue
        startingResult = sorted_snps[0]
        chrSegments.append(
            segment(
                startingResult.position,
                startingResult.position,
                1,
                startingResult.matching,
            )
        )
        for snp in sorted_snps:
            decideOnSegment(snp, chrSegments)
        segments[i] = chrSegments
        assert_segments_ok(f"chr{i} merged", segments[i])
        # readChromosomeMap korzysta z cache – plik czytany tylko raz na chromosom
        chromosomeMap = tools.readChromosomeMap(i)
        segments[i] = sortSegments(segments[i])
        addMetadata(segments[i], i, chromosomeMap)
        segmentsWithGaps = addGaps(segments[i], i, gap_threshold)
        segments[i] = sortSegments(segmentsWithGaps)
        segments[i] = removeInsignificantNotNoneSegments(
            segments[i], lenghThreshold, countThreshold
        )
        mergeEqualSegments(segments[i])
        addMetadata(segments[i], i, chromosomeMap)
        segments[i] = build_half_packages_between_anchors(
            segments[i], threshold_cm=anhor_threshold, gap_breaks=True
        )
        segments[i] = removeInsignificantNoneSegments(
            segments[i], lenghThreshold, countThreshold
        )
        mergeEqualSegments(segments[i])
        addMetadata(segments[i], i, chromosomeMap)
        segments[i] = build_none_packages_between_anchors(
            segments[i], threshold_cm=none_threshold
        )
    return segments


def addGaps(chrSegments, chr_num, gaps_threshold):
    chromosomeMap = tools.readChromosomeMap(chr_num)
    bps = [p.bp for p in chromosomeMap]
    if not chrSegments:
        return []

    norm = []
    for s in chrSegments:
        a, b = int(s.startingPoint), int(s.endPoint)
        if a > b:
            a, b = b, a
        s.startingPoint, s.endPoint = str(a), str(b)
        norm.append(s)
    norm.sort(key=lambda s: int(s.startingPoint))

    out = []
    for i in range(len(norm) - 1):
        cur, nxt = norm[i], norm[i + 1]
        out.append(cur)
        gap_start = int(cur.endPoint) + 1
        gap_end = int(nxt.startingPoint) - 1
        if gap_start <= gap_end:
            start_cM = interpolate_map_cm(chromosomeMap, gap_start, bps)
            end_cM = interpolate_map_cm(chromosomeMap, gap_end, bps)
            gap_len_cM = abs(end_cM - start_cM)
            if gap_len_cM >= gaps_threshold:
                out.append(
                    segment(
                        startingPoint=str(gap_start),
                        endPoint=str(gap_end),
                        count=0,
                        type="gap",
                        length=gap_len_cM,
                        density=0,
                    )
                )
    out.append(norm[-1])
    return out


def addMetadata(chrSegments, chr, chromosomeMap):
    bps = [p.bp for p in chromosomeMap]
    for seg in chrSegments:
        start_cM = interpolate_map_cm(chromosomeMap, int(seg.startingPoint), bps)
        end_cM = interpolate_map_cm(chromosomeMap, int(seg.endPoint), bps)
        seg.length = abs(end_cM - start_cM)
        seg.density = seg.count / seg.length if seg.length > 0 else 0


def interpolate_map_cm(chromosomePoints, position, bps):
    if position <= chromosomePoints[0].bp:
        return chromosomePoints[0].map_cM
    if position >= chromosomePoints[-1].bp:
        return chromosomePoints[-1].map_cM
    i = bisect_left(bps, position)
    if i < len(chromosomePoints) and chromosomePoints[i].bp == position:
        return chromosomePoints[i].map_cM
    left = chromosomePoints[i - 1]
    right = chromosomePoints[i]
    span = right.bp - left.bp
    if span <= 0:
        return left.map_cM
    t = (position - left.bp) / span
    return left.map_cM + t * (right.map_cM - left.map_cM)


def decideOnSegment(matchingResult, chrSegments):
    # Pomiń SNP bez danych – nie rozciągaj segmentu przez luki w danych
    if matchingResult.matching == "empty":
        return
    lastSegment = chrSegments[-1]
    if lastSegment.type == matchingResult.matching:
        lastSegment.count += 1
        lastSegment.endPoint = matchingResult.position
    else:
        chrSegments.append(
            segment(
                matchingResult.position,
                matchingResult.position,
                1,
                matchingResult.matching,
            )
        )


def removeInsignificantNotNoneSegments(mergedSegments, threshold, countThreshold):
    return [
        seg
        for seg in mergedSegments
        if seg.type == "none"
        or (
            seg.length is not None
            and seg.length > threshold
            and seg.count >= countThreshold
        )
    ]


def removeInsignificantNoneSegments(segments, threshold, countThreshold):
    if not segments:
        return []
    filtered = []
    n = len(segments)
    for i, seg in enumerate(segments):
        if i == 0 or i == n - 1:
            filtered.append(seg)
            continue
        if seg.type == "none" and seg.count == 1:
            left, right = segments[i - 1], segments[i + 1]
            same_type = (left.type == right.type) and (left.type != "none")
            left_ok = (
                (left.length is not None)
                and (left.length > threshold)
                and (left.count >= countThreshold)
            )
            right_ok = (
                (right.length is not None)
                and (right.length > threshold)
                and (right.count >= countThreshold)
            )
            if same_type and left_ok and right_ok:
                continue
        filtered.append(seg)
    return filtered


def mergeEqualSegments(mergedSegments):
    for i in range(len(mergedSegments) - 1, 0, -1):
        if mergedSegments[i].type == mergedSegments[i - 1].type:
            removeSegments(mergedSegments, i)


def removeSegments(mergedSegments, i):
    mergedSegments[i - 1].endPoint = mergedSegments[i].endPoint
    mergedSegments[i - 1].count += mergedSegments[i].count
    mergedSegments.pop(i)


def seg_len(s: segment) -> float:
    return float(s.length) if s.length is not None else 0.0


def sortSegments(segments):
    return sorted(segments, key=lambda s: int(s.startingPoint))


def assert_segments_ok(tag, segs):
    bad = [s for s in segs if int(s.startingPoint) > int(s.endPoint)]
    if bad:
        print(f"[{tag}] REVERSED {len(bad)} segments. Example:", bad[0])
    for i in range(1, len(segs)):
        if int(segs[i].startingPoint) < int(segs[i - 1].startingPoint):
            print(f"[{tag}] ORDER BROKEN at {i - 1}->{i}:", segs[i - 1], "->", segs[i])
            break


def _build_packages(
    segments: List[segment],
    threshold_cm: float,
    package_type: str,
    gap_breaks: bool = False,
    break_on_none: bool = False,
) -> List[segment]:
    """
    Wspólna implementacja dla build_half_packages_between_anchors
    i build_none_packages_between_anchors – różnią się tylko typem
    produkowanego pakietu i warunkami przerwania buforowania.
    """
    segs = sorted(segments, key=lambda s: int(s.startingPoint))
    out: List[segment] = []
    buffering: Optional[segment] = None
    buf_count = 0

    def is_anchor(s: segment) -> bool:
        return seg_len(s) >= threshold_cm and s.type != "gap"

    def is_breaker(s: segment) -> bool:
        if break_on_none and s.type == "none":
            return True
        if gap_breaks and s.type == "gap":
            return True
        return False

    def flush():
        nonlocal buffering, buf_count
        if buf_count > 0:
            out.append(buffering)
        buffering = None
        buf_count = 0

    for current in segs:
        if is_anchor(current):
            flush()
            out.append(current)
        elif is_breaker(current):
            flush()
            out.append(current)
        else:
            if buffering is None:
                buffering = segment(
                    startingPoint=current.startingPoint,
                    endPoint=current.endPoint,
                    count=current.count,
                    type=package_type,
                    length=seg_len(current),
                    density=current.density,
                )
                buf_count = 1
            else:
                buffering.endPoint = current.endPoint
                buffering.count += current.count
                if current.length is not None:
                    buffering.length = buffering.length + current.length
                    buffering.density = (
                        buffering.count / buffering.length
                        if buffering.length > 0
                        else 0
                    )
                buf_count += 1

    flush()
    return out


def build_half_packages_between_anchors(
    segments: List[segment],
    threshold_cm: float = 1.0,
    gap_breaks: bool = False,
) -> List[segment]:
    return _build_packages(
        segments,
        threshold_cm=threshold_cm,
        package_type="half",
        gap_breaks=gap_breaks,
        break_on_none=True,
    )


def build_none_packages_between_anchors(
    segments: List[segment],
    threshold_cm: float = 3.0,
) -> List[segment]:
    return _build_packages(
        segments,
        threshold_cm=threshold_cm,
        package_type="none",
        gap_breaks=False,
        break_on_none=False,
    )
