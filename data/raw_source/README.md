# Long-Term Block-Level Oil Palm Productivity Dataset with Leaf Nutrient and Soil Fertility Measurements from an Indonesian Plantation

## Public-release note

This package is an anonymized public-release version prepared for
scientific data deposition. The plantation identity, original division
name, operational block codes, original KCD identifiers, laboratory
sample identifiers, certificate/order metadata, and source filenames
have been removed or replaced with consistent anonymous identifiers.

The original-to-anonymous mapping is intentionally excluded from this
public package and is retained only by the data owner/research team.

## Dataset structure

-   `productivity_monthly.csv`: monthly block-level productivity
    observations from 2012--2024.
-   `block_characteristics.csv`: anonymous block characteristics derived
    from the longitudinal productivity table.
-   `leaf_sampling_event.csv`: KCD-level leaf nutrient laboratory
    observations from 2015--2022.
-   `kcd_block_membership.csv`: bridge table linking each KCD sampling
    event to its member block(s).
-   `soil_sampling_event.csv`: composite soil laboratory observations
    from 2017 and 2020.
-   `soil_block_membership.csv`: bridge table containing only Division_A
    member blocks represented by soil composite samples.
-   `data_dictionary.csv`: concise definitions of key variables.

## Relational design

Leaf nutrient values remain at the KCD sampling-event level. A KCD may
represent one or multiple blocks; composite measurements are not
duplicated as independent block measurements.

Soil analytical values remain at the soil sampling-event level. A soil
sample may represent multiple blocks. Public block linkage is restricted
to blocks belonging to the study division.

## Anonymization

`Division_A`, `B001`--style block identifiers, `KCD_YYYY_NNN`, and
`SOIL_YYYY_NNN` are anonymous public identifiers. They are consistent
across tables but cannot be used to recover the original operational
identifiers from this package.

## Recommended citation

Citation and DOI should be added after the Mendeley Data record is
created and finalized.
