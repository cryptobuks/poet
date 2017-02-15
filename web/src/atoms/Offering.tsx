import * as React from 'react';

import { Offering } from './Interfaces';

export function OfferingType(props: { offering: Offering }) {
  const type = props.offering
    && props.offering.attributes
    && props.offering.attributes.licenseType
    || '(unknown license type)'
  return <span>{ type }</span>
}

