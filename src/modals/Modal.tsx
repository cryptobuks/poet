declare var require: (moduleId: string) => any;

import * as React from 'react'

const Overlays = require('react-overlays');

export interface ModalVisible {
  visible: boolean
}

export interface ModalAction {
  cancelAction: () => any
}

export interface ModalProps extends ModalVisible, ModalAction {}

abstract class Modal<T extends ModalProps> extends React.Component<T, undefined> {
  render() {
    if (!this.props.visible) {
      return <div/>
    }
    return (
      <Overlays.Modal
        aria-labelledby='modal-label'
        ClassName="modal"
        backdropClassName="backdrop"
        show={this.props.visible}
        onHide={this.props.cancelAction}
      >
        { this.draw() }
      </Overlays.Modal>
    )
  }

  abstract draw(): any;
}

export default Modal;
